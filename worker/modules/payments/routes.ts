/**
 * PAY-1, PAY-2: payment recording and history. Owner: Person 3.
 */
import { and, count, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { idSchema, PAYMENT_METHODS, paymentSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { schema } from "../../lib/db";
import { customerLabel, toPayment } from "../../lib/dto";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { matchPayment, recordPayment, recordUnmatchedPayment } from "./service";

const { payments, invoices, customers } = schema;

const listSchema = listQuerySchema.extend({
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  unmatched: z.enum(["true"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Mounted under /invoices: POST /invoices/:id/payments */
export const invoicePaymentRoutes = new Hono<AppEnv>().post(
  "/:id/payments",
  requirePermission("payment:write"),
  validate("json", paymentSchema),
  async (c) => c.json({ data: await recordPayment(c.get("db"), c.env.DB, c.req.param("id"), c.req.valid("json"), currentUser(c).id) }, 201),
);

export const paymentRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("payment:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = and(
      q.invoiceId ? eq(payments.invoiceId, q.invoiceId) : undefined,
      q.customerId ? eq(payments.customerId, q.customerId) : undefined,
      q.method ? eq(payments.method, q.method) : undefined,
      q.unmatched ? isNull(payments.invoiceId) : undefined,
      q.from ? gte(payments.paidOn, q.from) : undefined,
      q.to ? lte(payments.paidOn, q.to) : undefined,
      q.q
        ? or(sql`${invoices.number} like ${likeTerm(q.q)}`, sql`${customers.companyName} like ${likeTerm(q.q)}`, sql`${payments.reference} like ${likeTerm(q.q)}`)
        : undefined,
    );
    const base = () =>
      db
        .select({ p: payments, invoiceNumber: invoices.number, c: customers })
        .from(payments)
        .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
        .leftJoin(customers, eq(customers.id, payments.customerId));
    const [rows, total] = await Promise.all([
      base()
        .where(where)
        .orderBy(orderBy(q.sort, { paidOn: payments.paidOn, amount: payments.amount }, desc(payments.paidOn)))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db
        .select({ n: count(), sum: sql<number>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
        .leftJoin(customers, eq(customers.id, payments.customerId))
        .where(where)
        .get(),
    ]);
    const data = rows.map((r) => toPayment(r.p, { invoiceNumber: r.invoiceNumber, customerName: customerLabel(r.c) }));
    return c.json({ ...paginated(data, q, total?.n ?? 0), totals: { amount: ((total?.sum ?? 0) / 100).toFixed(2) } });
  })

  .post("/", requirePermission("payment:write"), validate("json", paymentSchema.extend({ customerId: idSchema.nullable().optional() })), async (c) =>
    c.json({ data: await recordUnmatchedPayment(c.get("db"), c.req.valid("json"), currentUser(c).id) }, 201),
  )

  .post("/:id/match", requirePermission("payment:write"), validate("json", z.object({ invoiceId: idSchema })), async (c) =>
    c.json({ data: await matchPayment(c.get("db"), c.env.DB, c.req.param("id"), c.req.valid("json").invoiceId, currentUser(c).id) }),
  );
