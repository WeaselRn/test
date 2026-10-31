/**
 * Smart Dunning: schedule, reminder history, recovery stats, manual run. Owner: Person 4.
 */
import { Hono } from "hono";
import { listQuerySchema } from "../../../shared/api";
import { todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import type { AppEnv } from "../../env";
import { requirePermission } from "../../lib/auth";
import { paginated } from "../../lib/pagination";
import { setSetting } from "../../lib/settings";
import { all, first } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { dunningScheduleSchema, getSchedule, runDunning } from "./service";

export const dunningRoutes = new Hono<AppEnv>()
  .get("/schedule", requirePermission("invoice:read"), async (c) => c.json({ data: await getSchedule(c.get("db")) }))

  .put("/schedule", requirePermission("settings:write"), validate("json", dunningScheduleSchema), async (c) => {
    const steps = c.req.valid("json");
    if (new Set(steps.map((s) => s.step)).size !== steps.length) {
      return c.json({ error: { code: "validation_failed", message: "Step names must be unique.", fields: { steps: "Duplicate step name" } } }, 422);
    }
    await setSetting(c.get("db"), "dunning.schedule", steps);
    return c.json({ data: await getSchedule(c.get("db")) });
  })

  .get("/reminders", requirePermission("invoice:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const [rows, total] = await Promise.all([
      all<{ id: string; step: string; created_at: string; invoice_id: string; number: string; status: string; balance: number; customer: string; subject: string | null }>(
        c.env.DB,
        `SELECT r.id, r.step, r.created_at, i.id AS invoice_id, i.number, i.status, i.total - i.amount_paid AS balance,
                COALESCE(c.company_name, c.contact_name) AS customer, n.subject
         FROM payment_reminders r JOIN invoices i ON i.id = r.invoice_id JOIN customers c ON c.id = i.customer_id
         LEFT JOIN notifications n ON n.id = r.notification_id
         ORDER BY r.created_at DESC LIMIT ?1 OFFSET ?2`,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ),
      first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM payment_reminders`),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      step: r.step,
      sentAt: r.created_at,
      invoiceId: r.invoice_id,
      invoiceNumber: r.number,
      invoiceStatus: r.status,
      balance: fromMinor(r.balance),
      customerName: r.customer,
      subject: r.subject,
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/stats", requirePermission("invoice:read"), async (c) => {
    const row = await first<{ reminded: number; recovered: number; recovered_amount: number; outstanding: number; overdue_unreminded: number }>(
      c.env.DB,
      `SELECT COUNT(*) AS reminded,
              COUNT(CASE WHEN i.status = 'paid' THEN 1 END) AS recovered,
              COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total END), 0) AS recovered_amount,
              COALESCE(SUM(CASE WHEN i.status = 'confirmed' THEN i.total - i.amount_paid END), 0) AS outstanding,
              (SELECT COUNT(*) FROM invoices x WHERE x.status = 'confirmed' AND x.due_date < ?1 AND x.total > x.amount_paid
                 AND NOT EXISTS (SELECT 1 FROM payment_reminders y WHERE y.invoice_id = x.id)) AS overdue_unreminded
       FROM invoices i WHERE EXISTS (SELECT 1 FROM payment_reminders r WHERE r.invoice_id = i.id)`,
      todayISO(),
    );
    const reminded = row?.reminded ?? 0;
    return c.json({
      remindedInvoices: reminded,
      recoveredInvoices: row?.recovered ?? 0,
      recoveryRate: reminded ? Math.round(((row?.recovered ?? 0) / reminded) * 100) : 0,
      recoveredAmount: fromMinor(row?.recovered_amount ?? 0),
      outstandingAfterReminders: fromMinor(row?.outstanding ?? 0),
      overdueWithoutReminder: row?.overdue_unreminded ?? 0,
    });
  })

  .post("/run", requirePermission("invoice:write"), async (c) =>
    c.json({ data: await runDunning({ db: c.get("db"), env: c.env, today: todayISO() }) }),
  );
