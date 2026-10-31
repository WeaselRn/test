/**
 * REP-1..3: dashboard summary, revenue, overdue, MRR, subscription and payment
 * reports, CSV export. Owner: Person 3. Every figure is an SQL aggregate on indexed
 * columns, never rows loaded into the worker.
 */
import { Hono } from "hono";
import { z } from "zod";
import { addDays, addMonths, todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import type { AppEnv } from "../../env";
import { requirePermission } from "../../lib/auth";
import { all, first, MRR_EXPR, toCsv } from "../../lib/sql";
import { validate } from "../../lib/validate";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customerId: z.string().optional(),
  planId: z.string().optional(),
  status: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).default("month"),
});
type Range = z.infer<typeof rangeSchema>;

function range(q: Range) {
  const today = todayISO();
  return { from: q.from ?? `${today.slice(0, 8)}01`, to: q.to ?? today };
}

export async function summary(d1: D1Database, q: Range) {
  const { from, to } = range(q);
  const today = todayISO();
  const [subs, revenue, outstanding] = await Promise.all([
    first<{ active: number; mrr: number }>(
      d1,
      `SELECT COUNT(*) AS active, COALESCE(SUM(${MRR_EXPR}), 0) AS mrr
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active' AND (?1 IS NULL OR s.customer_id = ?1) AND (?2 IS NULL OR s.plan_id = ?2)`,
      q.customerId ?? null,
      q.planId ?? null,
    ),
    first<{ amount: number; count: number }>(
      d1,
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM payments
       WHERE paid_on BETWEEN ?1 AND ?2 AND (?3 IS NULL OR customer_id = ?3)`,
      from,
      to,
      q.customerId ?? null,
    ),
    first<{ outstanding: number; overdueCount: number; overdueAmount: number; draftCount: number }>(
      d1,
      `SELECT COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total - amount_paid END), 0) AS outstanding,
              COUNT(CASE WHEN status = 'confirmed' AND due_date < ?1 AND total > amount_paid THEN 1 END) AS overdueCount,
              COALESCE(SUM(CASE WHEN status = 'confirmed' AND due_date < ?1 THEN total - amount_paid END), 0) AS overdueAmount,
              COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draftCount
       FROM invoices WHERE (?2 IS NULL OR customer_id = ?2)`,
      today,
      q.customerId ?? null,
    ),
  ]);
  return {
    activeSubscriptions: subs?.active ?? 0,
    mrr: fromMinor(Math.round(subs?.mrr ?? 0)),
    arr: fromMinor(Math.round((subs?.mrr ?? 0) * 12)),
    revenueCollected: fromMinor(revenue?.amount ?? 0),
    paymentsCount: revenue?.count ?? 0,
    amountOutstanding: fromMinor(outstanding?.outstanding ?? 0),
    overdueInvoices: outstanding?.overdueCount ?? 0,
    overdueAmount: fromMinor(outstanding?.overdueAmount ?? 0),
    draftInvoices: outstanding?.draftCount ?? 0,
    range: { from, to },
  };
}

async function revenueSeries(d1: D1Database, q: Range) {
  const today = todayISO();
  const from = q.from ?? addMonths(`${today.slice(0, 8)}01`, -11);
  const to = q.to ?? today;
  const bucket = q.groupBy === "day" ? "paid_on" : q.groupBy === "week" ? "strftime('%Y-W%W', paid_on)" : "substr(paid_on, 1, 7)";
  const billedBucket = bucket.replace(/paid_on/g, "issue_date");
  const [collected, billed] = await Promise.all([
    all<{ period: string; amount: number }>(
      d1,
      `SELECT ${bucket} AS period, SUM(amount) AS amount FROM payments
       WHERE paid_on BETWEEN ?1 AND ?2 AND (?3 IS NULL OR customer_id = ?3) GROUP BY period ORDER BY period`,
      from,
      to,
      q.customerId ?? null,
    ),
    all<{ period: string; amount: number }>(
      d1,
      `SELECT ${billedBucket} AS period, SUM(total) AS amount FROM invoices
       WHERE status != 'cancelled' AND issue_date BETWEEN ?1 AND ?2 AND (?3 IS NULL OR customer_id = ?3) GROUP BY period ORDER BY period`,
      from,
      to,
      q.customerId ?? null,
    ),
  ]);
  const periods = [...new Set([...collected.map((r) => r.period), ...billed.map((r) => r.period)])].sort();
  return {
    range: { from, to },
    data: periods.map((period) => ({
      period,
      collected: fromMinor(collected.find((r) => r.period === period)?.amount ?? 0),
      billed: fromMinor(billed.find((r) => r.period === period)?.amount ?? 0),
    })),
  };
}

async function mrrTrend(d1: D1Database) {
  const today = todayISO();
  const months = Array.from({ length: 12 }, (_, i) => addDays(addMonths(`${today.slice(0, 8)}01`, i - 10), -1)).map((d) => (d > today ? today : d));
  const rows = await Promise.all(
    months.map((monthEnd) =>
      first<{ mrr: number; count: number }>(
        d1,
        `SELECT COALESCE(SUM(${MRR_EXPR}), 0) AS mrr, COUNT(*) AS count
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.start_date <= ?1 AND s.status IN ('active','paused','closed')
           AND NOT EXISTS (SELECT 1 FROM subscription_status_history h
                           WHERE h.subscription_id = s.id AND h.to_status = 'closed' AND substr(h.created_at, 1, 10) <= ?1)`,
        monthEnd,
      ),
    ),
  );
  return { data: months.map((m, i) => ({ period: m.slice(0, 7), mrr: fromMinor(Math.round(rows[i]?.mrr ?? 0)), subscriptions: rows[i]?.count ?? 0 })) };
}

export const reportRoutes = new Hono<AppEnv>()
  .use(requirePermission("report:read"))

  .get("/summary", validate("query", rangeSchema), async (c) => c.json({ data: await summary(c.env.DB, c.req.valid("query")) }))

  .get("/revenue", validate("query", rangeSchema), async (c) => c.json(await revenueSeries(c.env.DB, c.req.valid("query"))))

  .get("/mrr", async (c) => c.json(await mrrTrend(c.env.DB)))

  .get("/overdue", validate("query", rangeSchema), async (c) => {
    const today = todayISO();
    const q = c.req.valid("query");
    const [rows, aging] = await Promise.all([
      all<{ id: string; number: string; customer: string; due_date: string; balance: number; days: number }>(
        c.env.DB,
        `SELECT i.id, i.number, COALESCE(c.company_name, c.contact_name) AS customer, i.due_date,
                i.total - i.amount_paid AS balance, CAST(julianday(?1) - julianday(i.due_date) AS INTEGER) AS days
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.status = 'confirmed' AND i.due_date < ?1 AND i.total > i.amount_paid AND (?2 IS NULL OR i.customer_id = ?2)
         ORDER BY i.due_date ASC LIMIT 50`,
        today,
        q.customerId ?? null,
      ),
      all<{ bucket: string; count: number; amount: number }>(
        c.env.DB,
        `SELECT CASE WHEN d <= 7 THEN '1-7' WHEN d <= 30 THEN '8-30' WHEN d <= 60 THEN '31-60' ELSE '60+' END AS bucket,
                COUNT(*) AS count, SUM(bal) AS amount
         FROM (SELECT julianday(?1) - julianday(due_date) AS d, total - amount_paid AS bal FROM invoices
               WHERE status = 'confirmed' AND due_date < ?1 AND total > amount_paid)
         GROUP BY bucket`,
        today,
      ),
    ]);
    return c.json({
      data: rows.map((r) => ({ id: r.id, number: r.number, customerName: r.customer, dueDate: r.due_date, balance: fromMinor(r.balance), daysOverdue: r.days })),
      aging: ["1-7", "8-30", "31-60", "60+"].map((b) => {
        const r = aging.find((a) => a.bucket === b);
        return { bucket: b, count: r?.count ?? 0, amount: fromMinor(r?.amount ?? 0) };
      }),
    });
  })

  .get("/subscriptions", async (c) => {
    const [byStatus, byPlan] = await Promise.all([
      all<{ status: string; count: number }>(c.env.DB, `SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status`),
      all<{ id: string; name: string; billing_period: string; active: number; mrr: number }>(
        c.env.DB,
        `SELECT p.id, p.name, p.billing_period, COUNT(s.id) AS active, COALESCE(SUM(${MRR_EXPR}), 0) AS mrr
         FROM plans p LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
         GROUP BY p.id ORDER BY mrr DESC`,
      ),
    ]);
    return c.json({
      byStatus,
      byPlan: byPlan.map((p) => ({ planId: p.id, name: p.name, billingPeriod: p.billing_period, active: p.active, mrr: fromMinor(Math.round(p.mrr)) })),
    });
  })

  .get("/payments", validate("query", rangeSchema), async (c) => {
    const { from, to } = range(c.req.valid("query"));
    const rows = await all<{ method: string; count: number; amount: number }>(
      c.env.DB,
      `SELECT method, COUNT(*) AS count, SUM(amount) AS amount FROM payments WHERE paid_on BETWEEN ?1 AND ?2 GROUP BY method ORDER BY amount DESC`,
      from,
      to,
    );
    return c.json({ range: { from, to }, data: rows.map((r) => ({ method: r.method, count: r.count, amount: fromMinor(r.amount) })) });
  })

  /** CSV export of a report table for the selected range (bounded to 5,000 rows). */
  .get("/export/:kind", validate("query", rangeSchema), async (c) => {
    const kind = c.req.param("kind");
    const { from, to } = range(c.req.valid("query"));
    let csv: string;
    if (kind === "invoices") {
      const rows = await all<Record<string, string | number>>(
        c.env.DB,
        `SELECT i.number, COALESCE(c.company_name, c.contact_name) AS customer, i.status, i.issue_date, i.due_date, i.total, i.amount_paid
         FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.issue_date BETWEEN ?1 AND ?2 ORDER BY i.issue_date LIMIT 5000`,
        from,
        to,
      );
      csv = toCsv(
        ["Number", "Customer", "Status", "Issue date", "Due date", "Total", "Paid", "Balance"],
        rows.map((r) => [r.number, r.customer, r.status, r.issue_date, r.due_date, fromMinor(Number(r.total)), fromMinor(Number(r.amount_paid)), fromMinor(Number(r.total) - Number(r.amount_paid))]),
      );
    } else if (kind === "payments") {
      const rows = await all<Record<string, string | number | null>>(
        c.env.DB,
        `SELECT p.paid_on, i.number, COALESCE(c.company_name, c.contact_name) AS customer, p.method, p.amount, p.reference
         FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.paid_on BETWEEN ?1 AND ?2 ORDER BY p.paid_on LIMIT 5000`,
        from,
        to,
      );
      csv = toCsv(["Paid on", "Invoice", "Customer", "Method", "Amount", "Reference"], rows.map((r) => [r.paid_on, r.number ?? "Unmatched", r.customer, r.method, fromMinor(Number(r.amount)), r.reference]));
    } else {
      const rows = await all<Record<string, string | number | null>>(
        c.env.DB,
        `SELECT s.number, COALESCE(c.company_name, c.contact_name) AS customer, p.name AS plan, s.status, s.start_date, s.expiry_date, s.next_invoice_date, ${MRR_EXPR} AS mrr
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id ORDER BY s.number LIMIT 5000`,
      );
      csv = toCsv(
        ["Number", "Customer", "Plan", "Status", "Start", "Expiry", "Next invoice", "MRR"],
        rows.map((r) => [r.number, r.customer, r.plan, r.status, r.start_date, r.expiry_date, r.next_invoice_date, fromMinor(Math.round(Number(r.mrr)))]),
      );
    }
    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="brightloop-${kind}-${from}-to-${to}.csv"`,
    });
  });
