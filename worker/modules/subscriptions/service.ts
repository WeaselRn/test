/**
 * Subscription lifecycle service (SUB-1, SUB-2, PLAN-3). Owner: Person 1.
 * Every status change in the system goes through `transitionSubscription`, so the
 * rules in shared/lifecycle.ts live in exactly one place.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { addDays, diffDays, isWithin, periodStart, todayISO } from "../../../shared/dates";
import { canTransitionSubscription, type SubscriptionStatus } from "../../../shared/lifecycle";
import { fromMinor, toMinor } from "../../../shared/money";
import { priceInvoice, unitPrice, type TaxRule } from "../../../shared/pricing";
import type { SubscriptionInput } from "../../../shared/schemas";
import type { Subscription, SubscriptionLine, SubscriptionStatusChange } from "../../../shared/types";
import { nextNumber } from "../../lib/counters";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { customerLabel, toInvoice, toSubscription } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { activityEntry, auditEntry } from "../../lib/events";

const { subscriptions, subscriptionLines, subscriptionStatusHistory, plans, customers, products, productVariants, taxes } = schema;

export interface CreateOptions {
  status?: "draft" | "quotation";
  templateId?: string | null;
  quoteValidUntil?: string | null;
  renewedFromId?: string | null;
}

type LineRow = typeof subscriptionLines.$inferInsert;

/** Resolve and price subscription lines from catalog data. */
async function buildLines(db: Database, subscriptionId: string, input: SubscriptionInput, minQuantity: number): Promise<LineRow[]> {
  const fields: Record<string, string> = {};
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const variantIds = input.lines.map((l) => l.variantId).filter((v): v is string => !!v);
  const [productRows, variantRows, productTaxRows, taxRows] = await Promise.all([
    productIds.length ? db.select().from(products).where(inArray(products.id, productIds)) : [],
    variantIds.length ? db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [],
    productIds.length ? db.select().from(schema.productTaxes).where(inArray(schema.productTaxes.productId, productIds)) : [],
    db.select().from(taxes),
  ]);
  const productMap = new Map(productRows.map((p) => [p.id, p]));
  const variantMap = new Map(variantRows.map((v) => [v.id, v]));
  const taxMap = new Map(taxRows.map((t) => [t.id, t]));

  const rows = input.lines.map((l, i): LineRow | null => {
    const product = productMap.get(l.productId);
    if (!product) {
      fields[`lines.${i}.productId`] = "Product not found";
      return null;
    }
    const variant = l.variantId ? variantMap.get(l.variantId) : undefined;
    if (l.variantId && (!variant || variant.productId !== product.id)) {
      fields[`lines.${i}.variantId`] = "Variant does not belong to this product";
      return null;
    }
    if (l.quantity < minQuantity) {
      fields[`lines.${i}.quantity`] = `At least ${minQuantity} for this plan`;
      return null;
    }
    const price = l.unitPrice !== undefined ? toMinor(l.unitPrice) : unitPrice(product.salesPrice, variant?.extraPrice ?? 0);
    const taxId = l.taxId !== undefined ? l.taxId : (productTaxRows.find((pt) => pt.productId === product.id)?.taxId ?? null);
    const tax = taxId ? taxMap.get(taxId) : undefined;
    const priced = priceInvoice(
      [{ description: product.name, productId: product.id, quantity: l.quantity, unitPrice: price, taxes: tax ? [tax as TaxRule] : [] }],
      [],
      todayISO(),
    );
    return {
      id: newId(),
      subscriptionId,
      productId: product.id,
      variantId: variant?.id ?? null,
      quantity: l.quantity,
      unitPrice: price,
      taxId: tax?.id ?? null,
      discountId: null,
      amount: priced.total,
    };
  });
  if (Object.keys(fields).length) throw new ApiError("validation_failed", "Check the highlighted lines.", fields);
  return rows as LineRow[];
}

async function loadPlanFor(db: Database, planId: string, startDate: string) {
  const plan = await db.select().from(plans).where(eq(plans.id, planId)).get();
  if (!plan) throw new ApiError("validation_failed", "Choose a plan.", { planId: "Plan not found" });
  if (plan.status !== "active") throw new ApiError("validation_failed", "This plan is closed.", { planId: "Plan is closed" });
  if (!isWithin(startDate, plan.availableFrom, plan.availableTo)) {
    throw new ApiError("validation_failed", "The plan is not available on the start date.", {
      startDate: `Plan is available ${plan.availableFrom}${plan.availableTo ? ` to ${plan.availableTo}` : " onwards"}`,
    });
  }
  return plan;
}

export async function createSubscription(
  db: Database,
  d1: D1Database,
  input: SubscriptionInput,
  actorId: string | null,
  opts: CreateOptions = {},
): Promise<Subscription> {
  const customer = await db.select().from(customers).where(eq(customers.id, input.customerId)).get();
  if (!customer) throw new ApiError("validation_failed", "Choose a customer.", { customerId: "Customer not found" });
  const plan = await loadPlanFor(db, input.planId, input.startDate);
  const id = newId();
  const lines = await buildLines(db, id, input, plan.minQuantity);
  const number = await nextNumber(d1, "subscription", "SUB");
  const status = opts.status ?? "draft";

  await db.batch([
    db.insert(subscriptions).values({
      id,
      number,
      customerId: customer.id,
      planId: plan.id,
      templateId: opts.templateId ?? null,
      renewedFromId: opts.renewedFromId ?? null,
      status,
      startDate: input.startDate,
      expiryDate: input.expiryDate ?? null,
      paymentTermDays: input.paymentTermDays,
      quoteValidUntil: opts.quoteValidUntil ?? null,
      createdBy: actorId,
    }),
    ...lines.map((l) => db.insert(subscriptionLines).values(l)),
    db.insert(subscriptionStatusHistory).values({ id: newId(), subscriptionId: id, fromStatus: null, toStatus: status, actorId }),
    activityEntry(db, {
      customerId: customer.id,
      type: status === "quotation" ? "quotation.created" : "subscription.status_changed",
      summary: `${status === "quotation" ? "Quotation" : "Draft subscription"} ${number} created on ${plan.name}`,
      actorId,
      entity: "subscription",
      entityId: id,
    }),
    auditEntry(db, { actorId, action: "subscription.created", entity: "subscription", entityId: id, meta: { status } }),
  ]);
  return getSubscription(db, id);
}

/** Edit customer, plan, dates and lines while the subscription is still a draft or quotation. */
export async function updateSubscription(db: Database, id: string, input: SubscriptionInput, actorId: string): Promise<Subscription> {
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!sub) throw ApiError.notFound("Subscription");
  if (sub.status !== "draft" && sub.status !== "quotation") {
    throw new ApiError("invalid_transition", "Only draft subscriptions and quotations can be edited.");
  }
  const plan = await loadPlanFor(db, input.planId, input.startDate);
  const lines = await buildLines(db, id, input, plan.minQuantity);
  await db.batch([
    db
      .update(subscriptions)
      .set({
        customerId: input.customerId,
        planId: plan.id,
        startDate: input.startDate,
        expiryDate: input.expiryDate ?? null,
        paymentTermDays: input.paymentTermDays,
        updatedAt: nowISO(),
      })
      .where(eq(subscriptions.id, id)),
    db.delete(subscriptionLines).where(eq(subscriptionLines.subscriptionId, id)),
    ...lines.map((l) => db.insert(subscriptionLines).values(l)),
    auditEntry(db, { actorId, action: "subscription.updated", entity: "subscription", entityId: id }),
  ]);
  return getSubscription(db, id);
}

export async function getSubscription(db: Database, id: string) {
  const row = await db
    .select({ s: subscriptions, c: customers, planName: plans.name, plan: plans })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, id))
    .get();
  if (!row) throw ApiError.notFound("Subscription");
  const lines = await db
    .select({ l: subscriptionLines, productName: products.name, variantValue: productVariants.value, taxName: taxes.name })
    .from(subscriptionLines)
    .innerJoin(products, eq(products.id, subscriptionLines.productId))
    .leftJoin(productVariants, eq(productVariants.id, subscriptionLines.variantId))
    .leftJoin(taxes, eq(taxes.id, subscriptionLines.taxId))
    .where(eq(subscriptionLines.subscriptionId, id));
  const mappedLines: (SubscriptionLine & { variantName: string | null; taxName: string | null })[] = lines.map((r) => ({
    id: r.l.id,
    productId: r.l.productId,
    productName: r.productName,
    variantId: r.l.variantId,
    variantName: r.variantValue ?? null,
    quantity: r.l.quantity,
    unitPrice: fromMinor(r.l.unitPrice),
    taxId: r.l.taxId,
    taxName: r.taxName ?? null,
    discountId: r.l.discountId,
    amount: fromMinor(r.l.amount),
  }));
  const recurringTotal = row.plan.price + lines.reduce((a, r) => a + r.l.amount, 0);
  return {
    ...toSubscription(row.s, { customerName: customerLabel(row.c), planName: row.planName }),
    lines: mappedLines,
    plan: {
      id: row.plan.id,
      name: row.plan.name,
      price: fromMinor(row.plan.price),
      billingPeriod: row.plan.billingPeriod,
      closable: row.plan.closable,
      pausable: row.plan.pausable,
      renewable: row.plan.renewable,
    },
    recurringTotal: fromMinor(recurringTotal),
    renewedFromId: row.s.renewedFromId,
    closedReason: row.s.closedReason,
    quoteExpired: row.s.status === "quotation" && !!row.s.quoteValidUntil && row.s.quoteValidUntil < todayISO(),
  };
}

export async function getSubscriptionHistory(db: Database, id: string): Promise<SubscriptionStatusChange[]> {
  const rows = await db
    .select({ h: subscriptionStatusHistory, actorName: schema.users.name })
    .from(subscriptionStatusHistory)
    .leftJoin(schema.users, eq(schema.users.id, subscriptionStatusHistory.actorId))
    .where(eq(subscriptionStatusHistory.subscriptionId, id))
    .orderBy(desc(subscriptionStatusHistory.createdAt));
  return rows.map((r) => ({
    id: r.h.id,
    fromStatus: (r.h.fromStatus as SubscriptionStatus | null) ?? null,
    toStatus: r.h.toStatus as SubscriptionStatus,
    actorName: r.actorName ?? (r.h.actorId ? null : "System"),
    note: r.h.note,
    createdAt: r.h.createdAt,
  }));
}

export async function getSubscriptionInvoices(db: Database, id: string) {
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.subscriptionId, id))
    .orderBy(desc(schema.invoices.periodStart))
    .limit(100);
  return rows.map((r) => toInvoice(r));
}

/**
 * Move a subscription to `to`, enforcing forward-only moves and the plan switches.
 * Confirming a quotation whose start date has passed activates it immediately.
 */
export async function transitionSubscription(
  db: Database,
  id: string,
  to: SubscriptionStatus,
  actorId: string | null,
  note?: string | null,
  today = todayISO(),
): Promise<Subscription> {
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!sub) throw ApiError.notFound("Subscription");
  const plan = await db.select().from(plans).where(eq(plans.id, sub.planId)).get();
  if (!plan) throw ApiError.notFound("Plan");

  // System closures (plan ended, expiry) are not "early" closes, so the closable switch does not apply.
  const switches = actorId === null && to === "closed" ? { ...plan, closable: true } : plan;
  const check = canTransitionSubscription(sub.status, to, switches, { today, quoteValidUntil: sub.quoteValidUntil });
  if (!check.ok) throw new ApiError("invalid_transition", check.reason);

  const moves: { from: SubscriptionStatus; to: SubscriptionStatus }[] = [{ from: sub.status, to }];
  const patch: Partial<typeof subscriptions.$inferInsert> = { status: to, updatedAt: nowISO() };

  if (to === "quotation" && !sub.quoteValidUntil) patch.quoteValidUntil = addDays(today, 30);
  if (to === "active" && sub.status === "confirmed" && sub.startDate > today) {
    throw new ApiError("invalid_transition", `This subscription starts on ${sub.startDate} and activates automatically that day.`);
  }
  if (to === "confirmed" && sub.startDate <= today) {
    moves.push({ from: "confirmed", to: "active" });
    patch.status = "active";
  }
  if (patch.status === "active") {
    if (sub.status === "paused") {
      // Paused time is not billed: resume from the first period that starts today or later.
      let n = sub.billedPeriods;
      while (periodStart(sub.startDate, plan.billingPeriod, n) < today) n++;
      patch.billedPeriods = n;
      patch.nextInvoiceDate = periodStart(sub.startDate, plan.billingPeriod, n);
    } else {
      patch.nextInvoiceDate = periodStart(sub.startDate, plan.billingPeriod, sub.billedPeriods);
    }
  }
  if (to === "closed") {
    patch.nextInvoiceDate = null;
    patch.closedReason = note ?? "Closed manually";
  }

  const result = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.status, sub.status)))
    .returning({ id: subscriptions.id });
  if (!result.length) throw ApiError.conflict("This subscription changed while you were working. Reload and try again.");

  await db.batch([
    activityEntry(db, {
      customerId: sub.customerId,
      type: to === "quotation" ? "quotation.sent" : "subscription.status_changed",
      summary: `${sub.number} moved to ${moves.map((m) => m.to).join(" → ")}${note ? ` — ${note}` : ""}`,
      actorId,
      entity: "subscription",
      entityId: id,
    }),
    ...moves.map((m) =>
      db.insert(subscriptionStatusHistory).values({ id: newId(), subscriptionId: id, fromStatus: m.from, toStatus: m.to, actorId, note: note ?? null }),
    ),
    auditEntry(db, { actorId, action: "subscription.transition", entity: "subscription", entityId: id, meta: { from: sub.status, to: patch.status } }),
  ]);
  return getSubscription(db, id);
}

/** Create a renewal quotation that continues `id` after its expiry date (plan must be renewable). */
export async function createRenewalQuotation(
  db: Database,
  d1: D1Database,
  id: string,
  actorId: string | null,
  today = todayISO(),
): Promise<Subscription> {
  const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!sub) throw ApiError.notFound("Subscription");
  const plan = await db.select().from(plans).where(eq(plans.id, sub.planId)).get();
  if (!plan?.renewable) throw new ApiError("invalid_transition", "This plan does not allow renewals.");
  if (!["active", "paused", "closed"].includes(sub.status)) {
    throw new ApiError("invalid_transition", "Only active, paused or closed subscriptions can be renewed.");
  }
  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.renewedFromId, id), inArray(subscriptions.status, ["draft", "quotation", "confirmed", "active"])))
    .get();
  if (existing) throw ApiError.conflict("A renewal already exists for this subscription.");

  const lines = await db.select().from(subscriptionLines).where(eq(subscriptionLines.subscriptionId, id)).orderBy(asc(subscriptionLines.id));
  const startDate = sub.expiryDate && sub.expiryDate >= today ? addDays(sub.expiryDate, 1) : today;
  const term = sub.expiryDate ? diffDays(sub.startDate, sub.expiryDate) : null;
  return createSubscription(
    db,
    d1,
    {
      customerId: sub.customerId,
      planId: sub.planId,
      startDate,
      expiryDate: term !== null ? addDays(startDate, term) : null,
      paymentTermDays: sub.paymentTermDays,
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: fromMinor(l.unitPrice),
        taxId: l.taxId,
      })),
    },
    actorId,
    { status: "quotation", quoteValidUntil: addDays(today, 14), renewedFromId: id, templateId: sub.templateId },
  );
}
