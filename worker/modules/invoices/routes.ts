/**
 * INV-3: invoice list, detail and actions (confirm, cancel, send, edit draft).
 * Owner: Person 3. Calculations and state changes come from the billing service (Person 1).
 */
import { and, count, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { todayISO } from "../../../shared/dates";
import { INVOICE_STATUSES } from "../../../shared/lifecycle";
import { idSchema, isoDateSchema, moneySchema, nameSchema, notesSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { schema } from "../../lib/db";
import { customerLabel, toInvoice, toPayment } from "../../lib/dto";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { cancelInvoice, confirmInvoice, getInvoiceDetail, sendInvoice, updateDraftInvoice } from "../billing/service";

const { invoices, customers, subscriptions, payments } = schema;

export const invoiceListSchema = listQuerySchema.extend({
  status: z.string().optional(),
  customerId: z.string().optional(),
  subscriptionId: z.string().optional(),
  overdue: z.enum(["true"]).optional(),
  outstanding: z.enum(["true"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Shared filter builder (also used by the portal, which forces customerId). */
export function invoiceWhere(q: z.infer<typeof invoiceListSchema>, today = todayISO()) {
  const statuses = (q.status ?? "").split(",").filter((s): s is (typeof INVOICE_STATUSES)[number] => (INVOICE_STATUSES as readonly string[]).includes(s));
  return and(
    statuses.length ? inArray(invoices.status, statuses) : undefined,
    q.customerId ? eq(invoices.customerId, q.customerId) : undefined,
    q.subscriptionId ? eq(invoices.subscriptionId, q.subscriptionId) : undefined,
    q.overdue ? and(eq(invoices.status, "confirmed"), lt(invoices.dueDate, today), gt(sql`${invoices.total} - ${invoices.amountPaid}`, 0)) : undefined,
    q.outstanding ? and(eq(invoices.status, "confirmed"), gt(sql`${invoices.total} - ${invoices.amountPaid}`, 0)) : undefined,
    q.from ? gte(invoices.issueDate, q.from) : undefined,
    q.to ? lte(invoices.issueDate, q.to) : undefined,
    q.q
      ? or(sql`${invoices.number} like ${likeTerm(q.q)}`, sql`${customers.companyName} like ${likeTerm(q.q)}`, sql`${customers.contactName} like ${likeTerm(q.q)}`)
      : undefined,
  );
}

const editSchema = z.object({
  dueDate: isoDateSchema.optional(),
  lines: z.array(z.object({ id: idSchema, description: nameSchema, quantity: z.coerce.number().int().min(1), unitPrice: moneySchema })).min(1),
});

export const invoiceRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("invoice:read"), validate("query", invoiceListSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = invoiceWhere(q);
    const [rows, total, sums] = await Promise.all([
      db
        .select({ i: invoices, c: customers, subNumber: subscriptions.number })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
        .where(where)
        .orderBy(orderBy(q.sort, { number: invoices.number, issueDate: invoices.issueDate, dueDate: invoices.dueDate, total: invoices.total }, desc(invoices.issueDate)))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId)).where(where).get(),
      db
        .select({
          total: sql<number>`coalesce(sum(case when ${invoices.status} != 'cancelled' then ${invoices.total} end), 0)`,
          balance: sql<number>`coalesce(sum(case when ${invoices.status} = 'confirmed' then ${invoices.total} - ${invoices.amountPaid} end), 0)`,
        })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .where(where)
        .get(),
    ]);
    const data = rows.map((r) => toInvoice(r.i, { customerName: customerLabel(r.c), subscriptionNumber: r.subNumber }));
    return c.json({
      ...paginated(data, q, total?.n ?? 0),
      totals: { total: ((sums?.total ?? 0) / 100).toFixed(2), balance: ((sums?.balance ?? 0) / 100).toFixed(2) },
    });
  })

  .get("/:id", requirePermission("invoice:read"), async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const [detail, paymentRows] = await Promise.all([
      getInvoiceDetail(db, id),
      db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.paidOn)),
    ]);
    return c.json({ data: { ...detail, payments: paymentRows.map((p) => toPayment(p)) } });
  })

  .patch("/:id", requirePermission("invoice:write"), validate("json", editSchema), async (c) =>
    c.json({ data: await updateDraftInvoice(c.get("db"), c.req.param("id"), c.req.valid("json"), currentUser(c).id) }),
  )

  .post("/:id/confirm", requirePermission("invoice:write"), async (c) =>
    c.json({ data: await confirmInvoice(c.get("db"), c.req.param("id"), currentUser(c).id) }),
  )

  .post("/:id/cancel", requirePermission("invoice:write"), validate("json", z.object({ reason: notesSchema })), async (c) =>
    c.json({ data: await cancelInvoice(c.get("db"), c.req.param("id"), currentUser(c).id, c.req.valid("json").reason) }),
  )

  .post("/:id/send", requirePermission("invoice:write"), async (c) =>
    c.json({ data: await sendInvoice(c.get("db"), c.env, c.req.param("id"), currentUser(c).id) }),
  )

  /** Bulk-confirm draft invoices produced by a billing run. */
  .post("/confirm-drafts", requirePermission("invoice:write"), validate("json", z.object({ ids: z.array(idSchema).max(100) })), async (c) => {
    const db = c.get("db");
    const actor = currentUser(c).id;
    let confirmed = 0;
    for (const id of c.req.valid("json").ids) {
      await confirmInvoice(db, id, actor).then(() => confirmed++).catch(() => undefined);
    }
    return c.json({ data: { confirmed } });
  });
