/**
 * PORT-1, PORT-2: customer self-service portal. Owner: Person 4.
 * Every query filters by ownCustomerId(c) from the session — never by an id from the
 * request — so customers can only see their own records.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { customerSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, ownCustomerId, requirePermission } from "../../lib/auth";
import { nowISO, schema } from "../../lib/db";
import { toCustomer, toInvoice, toPayment, toSubscription } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { pageOffset, paginated } from "../../lib/pagination";
import { first } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { getInvoiceDetail } from "../billing/service";
import { invoiceListSchema, invoiceWhere } from "../invoices/routes";
import { cancellationRequestSchema, requestCancellation, resolveCancellation, resolveSchema } from "../retention/service";
import { createRenewalQuotation, getSubscription, transitionSubscription } from "../subscriptions/service";

const { subscriptions, plans, invoices, payments, customers } = schema;

async function ownSubscription(c: Parameters<typeof ownCustomerId>[0], id: string) {
  const sub = await c.get("db").select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.customerId, ownCustomerId(c)))).get();
  if (!sub) throw ApiError.notFound("Subscription");
  return sub;
}

export const portalRoutes = new Hono<AppEnv>()
  .use(requirePermission("portal:access"))

  .get("/summary", async (c) => {
    const id = ownCustomerId(c);
    const today = todayISO();
    const row = await first<{ active: number; outstanding: number; overdue: number; next_due: string | null; paid: number }>(
      c.env.DB,
      `SELECT (SELECT COUNT(*) FROM subscriptions WHERE customer_id = ?1 AND status = 'active') AS active,
              (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE customer_id = ?1 AND status = 'confirmed') AS outstanding,
              (SELECT COUNT(*) FROM invoices WHERE customer_id = ?1 AND status = 'confirmed' AND due_date < ?2 AND total > amount_paid) AS overdue,
              (SELECT MIN(due_date) FROM invoices WHERE customer_id = ?1 AND status = 'confirmed' AND total > amount_paid) AS next_due,
              (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = ?1) AS paid`,
      id,
      today,
    );
    return c.json({
      data: {
        activeSubscriptions: row?.active ?? 0,
        outstanding: fromMinor(row?.outstanding ?? 0),
        overdueInvoices: row?.overdue ?? 0,
        nextDueDate: row?.next_due ?? null,
        totalPaid: fromMinor(row?.paid ?? 0),
      },
    });
  })

  .get("/subscriptions", validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    // Customers see their quotations and live subscriptions, not internal drafts.
    const where = and(eq(subscriptions.customerId, ownCustomerId(c)), inArray(subscriptions.status, ["quotation", "confirmed", "active", "paused", "closed"]));
    const [rows, total] = await Promise.all([
      db
        .select({ s: subscriptions, planName: plans.name, p: plans })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(where)
        .orderBy(desc(subscriptions.createdAt))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(subscriptions).where(where).get(),
    ]);
    const data = rows.map((r) => ({
      ...toSubscription(r.s, { planName: r.planName }),
      billingPeriod: r.p.billingPeriod,
      planPrice: fromMinor(r.p.price),
      pausable: r.p.pausable,
      closable: r.p.closable,
      renewable: r.p.renewable,
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/subscriptions/:id", async (c) => {
    await ownSubscription(c, c.req.param("id"));
    const db = c.get("db");
    const [sub, invoiceRows] = await Promise.all([
      getSubscription(db, c.req.param("id")),
      db.select().from(invoices).where(and(eq(invoices.subscriptionId, c.req.param("id")), inArray(invoices.status, ["confirmed", "paid"]))).orderBy(desc(invoices.periodStart)).limit(24),
    ]);
    if (sub.status === "draft") throw ApiError.notFound("Subscription");
    return c.json({ data: { ...sub, invoices: invoiceRows.map((i) => toInvoice(i)) } });
  })

  .post("/subscriptions/:id/pause", async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    return c.json({ data: await transitionSubscription(c.get("db"), sub.id, "paused", currentUser(c).id, "Paused by customer") });
  })

  .post("/subscriptions/:id/resume", async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    if (sub.status !== "paused") throw new ApiError("invalid_transition", "Only paused subscriptions can be resumed.");
    return c.json({ data: await transitionSubscription(c.get("db"), sub.id, "active", currentUser(c).id, "Resumed by customer") });
  })

  /** Accept a quotation (customer confirms the offer). */
  .post("/subscriptions/:id/accept", async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    if (sub.status !== "quotation") throw new ApiError("invalid_transition", "Only open quotations can be accepted.");
    return c.json({ data: await transitionSubscription(c.get("db"), sub.id, "confirmed", currentUser(c).id, "Accepted by customer") });
  })

  .post("/subscriptions/:id/renew", async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    return c.json({ data: await createRenewalQuotation(c.get("db"), c.env.DB, sub.id, currentUser(c).id) }, 201);
  })

  .post("/subscriptions/:id/close", async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    return c.json({ data: await transitionSubscription(c.get("db"), sub.id, "closed", currentUser(c).id, "Closed by customer") });
  })

  .post("/subscriptions/:id/cancellation-request", validate("json", cancellationRequestSchema), async (c) => {
    const sub = await ownSubscription(c, c.req.param("id"));
    return c.json({ data: await requestCancellation(c.get("db"), sub.id, ownCustomerId(c), c.req.valid("json"), currentUser(c).id) }, 201);
  })

  .post("/cancellation-requests/:id/resolve", validate("json", resolveSchema), async (c) =>
    c.json({ data: await resolveCancellation(c.get("db"), c.req.param("id"), ownCustomerId(c), c.req.valid("json").decision, currentUser(c).id) }),
  )

  .get("/invoices", validate("query", invoiceListSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    // Drafts are internal; customers see confirmed, paid and cancelled invoices only.
    const where = and(invoiceWhere({ ...q, customerId: ownCustomerId(c), q: undefined }), inArray(invoices.status, ["confirmed", "paid", "cancelled"]));
    const [rows, total] = await Promise.all([
      db
        .select({ i: invoices, subNumber: subscriptions.number })
        .from(invoices)
        .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .where(where)
        .orderBy(desc(invoices.issueDate))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId)).where(where).get(),
    ]);
    return c.json(paginated(rows.map((r) => toInvoice(r.i, { subscriptionNumber: r.subNumber })), q, total?.n ?? 0));
  })

  .get("/invoices/:id", async (c) => {
    const db = c.get("db");
    const inv = await db.select().from(invoices).where(and(eq(invoices.id, c.req.param("id")), eq(invoices.customerId, ownCustomerId(c)))).get();
    if (!inv || inv.status === "draft") throw ApiError.notFound("Invoice");
    const [detail, paymentRows] = await Promise.all([
      getInvoiceDetail(db, inv.id),
      db.select().from(payments).where(eq(payments.invoiceId, inv.id)).orderBy(desc(payments.paidOn)),
    ]);
    return c.json({ data: { ...detail, payments: paymentRows.map((p) => toPayment(p)) } });
  })

  .get("/payments", validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = eq(payments.customerId, ownCustomerId(c));
    const [rows, total] = await Promise.all([
      db
        .select({ p: payments, invoiceNumber: invoices.number })
        .from(payments)
        .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(where)
        .orderBy(desc(payments.paidOn))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(payments).where(where).get(),
    ]);
    return c.json(paginated(rows.map((r) => toPayment(r.p, { invoiceNumber: r.invoiceNumber })), q, total?.n ?? 0));
  })

  .get("/profile", async (c) => {
    const row = await c.get("db").select().from(customers).where(eq(customers.id, ownCustomerId(c))).get();
    if (!row) throw ApiError.notFound("Customer");
    return c.json({ data: toCustomer(row) });
  })

  .patch("/profile", validate("json", customerSchema.omit({ email: true }).extend({ email: z.string().optional() })), async (c) => {
    const { email: _ignored, ...input } = c.req.valid("json");
    void _ignored;
    const res = await c.get("db").update(customers).set({ ...input, updatedAt: nowISO() }).where(eq(customers.id, ownCustomerId(c))).returning();
    return c.json({ data: toCustomer(res[0]!) });
  });
