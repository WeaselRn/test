/**
 * Recurring billing engine and authoritative invoice actions (INV-1, INV-2, INV-4,
 * DISC-3). Owner: Person 1.
 *
 * "Nothing billed twice, nothing skipped":
 * - unique index invoices(subscription_id, period_start) makes duplicates impossible;
 * - each period is written in one atomic D1 batch (invoice, lines, discount usage,
 *   subscription billing anchor);
 * - the run loops while next_invoice_date <= today, so missed days catch up.
 */
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { addDays, periodEnd, periodStart, todayISO } from "../../../shared/dates";
import { canTransitionInvoice } from "../../../shared/lifecycle";
import { fromMinor, toMinor } from "../../../shared/money";
import { lineTax, priceInvoice, type DiscountRule, type PricingLineInput, type TaxRule } from "../../../shared/pricing";
import type { BillingRunResult, Invoice } from "../../../shared/types";
import { nextNumber } from "../../lib/counters";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { customerLabel, toInvoice, toInvoiceLine } from "../../lib/dto";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import { activityEntry, auditEntry } from "../../lib/events";
import { sendEmail } from "../../lib/notifications";
import { money } from "../../lib/format";

const { invoices, invoiceLines, subscriptions, subscriptionLines, plans, customers, discounts, discountRedemptions } = schema;

/** Safety valve per run (free-plan CPU): remaining subscriptions are picked up by the next run. */
const MAX_PERIODS_PER_RUN = 500;

async function loadDiscountRules(db: Database): Promise<DiscountRule[]> {
  const [rows, links] = await Promise.all([
    db.select().from(discounts).where(eq(discounts.isActive, true)),
    db.select().from(schema.discountProducts),
  ]);
  return rows.map((d) => ({ ...d, productIds: links.filter((l) => l.discountId === d.id).map((l) => l.productId) }));
}

async function loadTaxes(db: Database): Promise<Map<string, TaxRule>> {
  const rows = await db.select().from(schema.taxes);
  return new Map(rows.map((t) => [t.id, t]));
}

type Outcome = "created" | "skipped" | "failed";

/**
 * Create the invoice for billing period `n` of a subscription. Returns "skipped" when
 * the period was already invoiced (another run won the race).
 */
export async function generateInvoiceForPeriod(
  db: Database,
  d1: D1Database,
  subscriptionId: string,
  n: number,
  ctx: { today: string; runId: string | null; discountRules: DiscountRule[]; taxes: Map<string, TaxRule> },
): Promise<Outcome> {
  const row = await db
    .select({ s: subscriptions, p: plans, c: customers })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(subscriptions.id, subscriptionId))
    .get();
  if (!row) return "failed";
  const { s, p, c } = row;
  const start = periodStart(s.startDate, p.billingPeriod, n);
  const end = periodEnd(s.startDate, p.billingPeriod, n);

  const subLines = await db
    .select({ l: subscriptionLines, productName: schema.products.name, variantValue: schema.productVariants.value })
    .from(subscriptionLines)
    .innerJoin(schema.products, eq(schema.products.id, subscriptionLines.productId))
    .leftJoin(schema.productVariants, eq(schema.productVariants.id, subscriptionLines.variantId))
    .where(eq(subscriptionLines.subscriptionId, s.id));

  // PRD assumption: the plan price is a recurring base fee billed as its own line.
  const pricingLines: PricingLineInput[] = [
    { description: `${p.name} — ${start} to ${end}`, productId: null, quantity: 1, unitPrice: p.price, taxes: [] },
    ...subLines.map((r) => ({
      description: r.variantValue ? `${r.productName} (${r.variantValue})` : r.productName,
      productId: r.l.productId,
      quantity: r.l.quantity,
      unitPrice: r.l.unitPrice,
      taxes: r.l.taxId && ctx.taxes.get(r.l.taxId) ? [ctx.taxes.get(r.l.taxId)!] : [],
    })),
  ];
  const priced = priceInvoice(pricingLines, ctx.discountRules, ctx.today);

  const invoiceId = newId();
  const number = await nextNumber(d1, "invoice", "INV");
  const advance = db
    .update(subscriptions)
    .set({ billedPeriods: n + 1, nextInvoiceDate: periodStart(s.startDate, p.billingPeriod, n + 1), updatedAt: nowISO() })
    .where(and(eq(subscriptions.id, s.id), eq(subscriptions.billedPeriods, n)));

  try {
    await db.batch([
      db.insert(invoices).values({
        id: invoiceId,
        number,
        subscriptionId: s.id,
        customerId: c.id,
        periodStart: start,
        periodEnd: end,
        status: "draft",
        issueDate: ctx.today,
        dueDate: addDays(ctx.today, s.paymentTermDays),
        subtotal: priced.subtotal,
        discountTotal: priced.discountTotal,
        taxTotal: priced.taxTotal,
        total: priced.total,
        customerSnapshot: { name: customerLabel(c), contactName: c.contactName, email: c.email, billingAddress: c.billingAddress, taxId: c.taxId },
        billingRunId: ctx.runId,
      }),
      ...priced.lines.map((l, i) =>
        db.insert(invoiceLines).values({
          id: newId(),
          invoiceId,
          description: l.description,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          amount: l.amount,
          sortOrder: i,
        }),
      ),
      ...(priced.appliedDiscount
        ? [
            db.insert(discountRedemptions).values({ id: newId(), discountId: priced.appliedDiscount.id, invoiceId, amount: priced.appliedDiscount.amount }),
            db.update(discounts).set({ usageCount: sql`usage_count + 1` }).where(eq(discounts.id, priced.appliedDiscount.id)),
          ]
        : []),
      advance,
      activityEntry(db, {
        customerId: c.id,
        type: "invoice.generated",
        summary: `Invoice ${number} generated for ${start} – ${end} (${money(priced.total)})`,
        entity: "invoice",
        entityId: invoiceId,
      }),
    ]);
    // Keep the in-memory rule in step so the usage limit holds within this run.
    if (priced.appliedDiscount) {
      const rule = ctx.discountRules.find((d) => d.id === priced.appliedDiscount!.id);
      if (rule) rule.usageCount++;
    }
    return "created";
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // The period already has an invoice: move the anchor past it and report it as skipped.
    await advance;
    return "skipped";
  }
}

/** Run billing for every Active subscription due on or before `today`. */
export async function runBilling(
  db: Database,
  d1: D1Database,
  opts: { today?: string; trigger: "cron" | "manual"; actorId?: string | null },
): Promise<BillingRunResult & { details: { subscription: string; period: string; outcome: Outcome; error?: string }[] }> {
  const today = opts.today ?? todayISO();
  const runId = newId();
  await db.insert(schema.billingRuns).values({ id: runId, trigger: opts.trigger, runDate: today, actorId: opts.actorId ?? null, status: "running" });

  const ctx = { today, runId, discountRules: await loadDiscountRules(db), taxes: await loadTaxes(db) };
  const counts = { created: 0, skipped: 0, failed: 0 };
  const details: { subscription: string; period: string; outcome: Outcome; error?: string }[] = [];
  let processed = 0;

  const due = await db
    .select({ id: subscriptions.id, number: subscriptions.number, startDate: subscriptions.startDate, expiryDate: subscriptions.expiryDate, billedPeriods: subscriptions.billedPeriods, period: plans.billingPeriod })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.status, "active"), isNotNull(subscriptions.nextInvoiceDate), lte(subscriptions.nextInvoiceDate, today)));

  for (const sub of due) {
    let n = sub.billedPeriods;
    // Catch up every missed period up to today, never past the expiry date.
    while (processed < MAX_PERIODS_PER_RUN) {
      const start = periodStart(sub.startDate, sub.period, n);
      if (start > today || (sub.expiryDate && start > sub.expiryDate)) break;
      processed++;
      try {
        const outcome = await generateInvoiceForPeriod(db, d1, sub.id, n, ctx);
        counts[outcome]++;
        details.push({ subscription: sub.number, period: start, outcome });
        if (outcome === "failed") break;
      } catch (err) {
        counts.failed++;
        details.push({ subscription: sub.number, period: start, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
        break;
      }
      n++;
    }
    if (sub.expiryDate) {
      // Stop scheduling invoices once the next period starts after expiry.
      const next = periodStart(sub.startDate, sub.period, n);
      if (next > sub.expiryDate) await db.update(subscriptions).set({ nextInvoiceDate: null }).where(eq(subscriptions.id, sub.id));
    }
  }

  const finishedAt = nowISO();
  await db.batch([
    db
      .update(schema.billingRuns)
      .set({ status: "completed", ...counts, details: details.slice(0, 200), finishedAt })
      .where(eq(schema.billingRuns.id, runId)),
    auditEntry(db, { actorId: opts.actorId ?? null, action: "billing.run", entity: "billing_run", entityId: runId, meta: counts }),
  ]);
  const run = await db.select().from(schema.billingRuns).where(eq(schema.billingRuns.id, runId)).get();
  return { ...(run as BillingRunResult), details };
}

/* ───────────── Invoice actions (used by the invoices module, Person 3) ───────────── */

async function loadInvoice(db: Database, id: string) {
  const inv = await db.select().from(invoices).where(eq(invoices.id, id)).get();
  if (!inv) throw ApiError.notFound("Invoice");
  return inv;
}

export async function getInvoiceDetail(db: Database, id: string) {
  const row = await db
    .select({ i: invoices, c: customers, subNumber: subscriptions.number })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
    .where(eq(invoices.id, id))
    .get();
  if (!row) throw ApiError.notFound("Invoice");
  const [lines, redemption] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(invoiceLines.sortOrder),
    db
      .select({ name: discounts.name, amount: discountRedemptions.amount })
      .from(discountRedemptions)
      .innerJoin(discounts, eq(discounts.id, discountRedemptions.discountId))
      .where(and(eq(discountRedemptions.invoiceId, id), isNull(discountRedemptions.releasedAt)))
      .get(),
  ]);
  return {
    ...toInvoice(row.i, { customerName: customerLabel(row.c), subscriptionNumber: row.subNumber }),
    lines: lines.map(toInvoiceLine),
    customer: (row.i.customerSnapshot as Record<string, string | null>) ?? { name: customerLabel(row.c), email: row.c.email },
    discount: redemption ? { name: redemption.name, amount: fromMinor(redemption.amount) } : null,
    confirmedAt: row.i.confirmedAt,
    paidAt: row.i.paidAt,
    cancelledAt: row.i.cancelledAt,
  };
}

export async function confirmInvoice(db: Database, id: string, actorId: string): Promise<Invoice> {
  const inv = await loadInvoice(db, id);
  if (!canTransitionInvoice(inv.status, "confirmed")) throw new ApiError("invalid_transition", `A ${inv.status} invoice cannot be confirmed.`);
  const sub = await db.select({ terms: subscriptions.paymentTermDays }).from(subscriptions).where(eq(subscriptions.id, inv.subscriptionId)).get();
  const today = todayISO();
  await db.batch([
    db
      .update(invoices)
      .set({ status: "confirmed", issueDate: today, dueDate: addDays(today, sub?.terms ?? 15), confirmedAt: nowISO(), updatedAt: nowISO() })
      .where(and(eq(invoices.id, id), eq(invoices.status, "draft"))),
    auditEntry(db, { actorId, action: "invoice.confirmed", entity: "invoice", entityId: id }),
  ]);
  return toInvoice(await loadInvoice(db, id));
}

/** Cancel a draft or confirmed invoice with no payments; releases discount usage. */
export async function cancelInvoice(db: Database, id: string, actorId: string, reason?: string | null): Promise<Invoice> {
  const inv = await loadInvoice(db, id);
  if (!canTransitionInvoice(inv.status, "cancelled")) throw new ApiError("invalid_transition", `A ${inv.status} invoice cannot be cancelled.`);
  if (inv.amountPaid > 0) throw new ApiError("invalid_transition", "This invoice has payments recorded and cannot be cancelled.");
  const redemptions = await db
    .select()
    .from(discountRedemptions)
    .where(and(eq(discountRedemptions.invoiceId, id), isNull(discountRedemptions.releasedAt)));
  await db.batch([
    db.update(invoices).set({ status: "cancelled", cancelledAt: nowISO(), updatedAt: nowISO() }).where(eq(invoices.id, id)),
    ...redemptions.flatMap((r) => [
      db.update(discountRedemptions).set({ releasedAt: nowISO() }).where(eq(discountRedemptions.id, r.id)),
      db.update(discounts).set({ usageCount: sql`max(usage_count - 1, 0)` }).where(eq(discounts.id, r.discountId)),
    ]),
    activityEntry(db, {
      customerId: inv.customerId,
      type: "invoice.cancelled",
      summary: `Invoice ${inv.number} cancelled${reason ? ` — ${reason}` : ""}`,
      actorId,
      entity: "invoice",
      entityId: id,
    }),
    auditEntry(db, { actorId, action: "invoice.cancelled", entity: "invoice", entityId: id, meta: { reason } }),
  ]);
  return toInvoice(await loadInvoice(db, id));
}

/** Edit quantities, unit prices and descriptions of a draft invoice; totals are recomputed. */
export async function updateDraftInvoice(
  db: Database,
  id: string,
  input: { dueDate?: string; lines: { id: string; description: string; quantity: number; unitPrice: string }[] },
  actorId: string,
): Promise<Invoice> {
  const inv = await loadInvoice(db, id);
  if (inv.status !== "draft") throw new ApiError("invalid_transition", "Only draft invoices can be edited.");
  const existing = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  const productIds = existing.map((l) => l.productId).filter((p): p is string => !!p);
  const [links, taxes] = await Promise.all([
    productIds.length ? db.select().from(schema.productTaxes).where(inArray(schema.productTaxes.productId, productIds)) : [],
    loadTaxes(db),
  ]);
  const updated = input.lines.map((l) => {
    const old = existing.find((e) => e.id === l.id);
    if (!old) throw new ApiError("validation_failed", "Unknown invoice line.", { lines: "Unknown line" });
    const gross = l.quantity * toMinor(l.unitPrice);
    const discountAmount = Math.min(old.discountAmount, gross);
    const lineTaxes = links.filter((x) => x.productId === old.productId).map((x) => taxes.get(x.taxId)).filter((t): t is TaxRule => !!t);
    const net = gross - discountAmount;
    const taxAmount = old.productId ? lineTax(net, l.quantity, lineTaxes.slice(0, 1)) : 0;
    return { ...old, description: l.description, quantity: l.quantity, unitPrice: toMinor(l.unitPrice), discountAmount, taxAmount, amount: net + taxAmount };
  });
  const subtotal = updated.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const discountTotal = updated.reduce((a, l) => a + l.discountAmount, 0);
  const taxTotal = updated.reduce((a, l) => a + l.taxAmount, 0);
  await db.batch([
    db
      .update(invoices)
      .set({ subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal, dueDate: input.dueDate ?? inv.dueDate, updatedAt: nowISO() })
      .where(eq(invoices.id, id)),
    ...updated.map((l) =>
      db
        .update(invoiceLines)
        .set({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountAmount: l.discountAmount, taxAmount: l.taxAmount, amount: l.amount })
        .where(eq(invoiceLines.id, l.id)),
    ),
    auditEntry(db, { actorId, action: "invoice.edited", entity: "invoice", entityId: id }),
  ]);
  return toInvoice(await loadInvoice(db, id));
}

/** Email the invoice to the customer (simulated outbox in demo mode). Confirms drafts first. */
export async function sendInvoice(db: Database, env: Env, id: string, actorId: string): Promise<Invoice> {
  let inv = await loadInvoice(db, id);
  if (inv.status === "draft") {
    await confirmInvoice(db, id, actorId);
    inv = await loadInvoice(db, id);
  }
  if (inv.status === "cancelled") throw new ApiError("invalid_transition", "A cancelled invoice cannot be sent.");
  const customer = await db.select().from(customers).where(eq(customers.id, inv.customerId)).get();
  if (!customer) throw ApiError.notFound("Customer");
  await sendEmail(db, env, {
    to: customer.email,
    userId: customer.userId,
    subject: `Invoice ${inv.number} from Brightloop — ${money(inv.total)} due ${inv.dueDate}`,
    body: `Hi ${customer.contactName},\n\nInvoice ${inv.number} for ${inv.periodStart} to ${inv.periodEnd} is ready.\nTotal: ${money(inv.total)}\nBalance: ${money(inv.total - inv.amountPaid)}\nDue: ${inv.dueDate}\n\nView and print it in your portal: ${env.APP_URL}/portal/invoices/${inv.id}\n`,
    entity: "invoice",
    entityId: id,
  });
  await db.batch([
    db.update(invoices).set({ sentAt: nowISO(), updatedAt: nowISO() }).where(eq(invoices.id, id)),
    activityEntry(db, { customerId: inv.customerId, type: "invoice.sent", summary: `Invoice ${inv.number} sent to ${customer.email}`, actorId, entity: "invoice", entityId: id }),
  ]);
  return toInvoice(await loadInvoice(db, id));
}
