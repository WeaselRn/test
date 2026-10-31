/**
 * Renewal queue and dashboard. Owner: Person 4.
 */
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { addDays, todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { notesSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { paginated } from "../../lib/pagination";
import { all, first, MRR_EXPR } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { quoteRenewal, scanRenewals } from "./service";

const listSchema = listQuerySchema.extend({
  status: z.enum(["open", "quoted", "renewed", "cancelled", "expired"]).optional(),
  window: z.coerce.number().int().min(1).max(365).optional(),
});

export const renewalRoutes = new Hono<AppEnv>()
  .get("/summary", requirePermission("subscription:read"), async (c) => {
    const today = todayISO();
    const row = await first<{ due7: number; due30: number; quoted: number; renewed: number; expired: number }>(
      c.env.DB,
      `SELECT
         (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expiry_date BETWEEN ?1 AND ?2) AS due7,
         (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expiry_date BETWEEN ?1 AND ?3) AS due30,
         (SELECT COUNT(*) FROM renewal_tasks WHERE status = 'quoted') AS quoted,
         (SELECT COUNT(*) FROM renewal_tasks WHERE status = 'renewed') AS renewed,
         (SELECT COUNT(*) FROM renewal_tasks WHERE status = 'expired') AS expired`,
      today,
      addDays(today, 7),
      addDays(today, 30),
    );
    return c.json({ dueIn7: row?.due7 ?? 0, dueIn30: row?.due30 ?? 0, awaitingResponse: row?.quoted ?? 0, renewed: row?.renewed ?? 0, expired: row?.expired ?? 0 });
  })

  .get("/", requirePermission("subscription:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const today = todayISO();
    const where = `(?1 IS NULL OR t.status = ?1) AND (?2 IS NULL OR t.due_on <= ?2)`;
    const binds = [q.status ?? null, q.window ? addDays(today, q.window) : null];
    const [rows, total] = await Promise.all([
      all<{
        id: string;
        status: string;
        due_on: string;
        note: string | null;
        subscription_id: string;
        number: string;
        sub_status: string;
        customer_id: string;
        customer: string;
        plan: string;
        renewable: number;
        mrr: number;
        renewal_subscription_id: string | null;
        renewal_number: string | null;
        renewal_status: string | null;
      }>(
        c.env.DB,
        `SELECT t.id, t.status, t.due_on, t.note, s.id AS subscription_id, s.number, s.status AS sub_status, s.customer_id,
                COALESCE(cu.company_name, cu.contact_name) AS customer, p.name AS plan, p.renewable, ${MRR_EXPR} AS mrr,
                t.renewal_subscription_id, r.number AS renewal_number, r.status AS renewal_status
         FROM renewal_tasks t JOIN subscriptions s ON s.id = t.subscription_id JOIN plans p ON p.id = s.plan_id
         JOIN customers cu ON cu.id = s.customer_id LEFT JOIN subscriptions r ON r.id = t.renewal_subscription_id
         WHERE ${where}
         ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'quoted' THEN 1 ELSE 2 END, t.due_on ASC
         LIMIT ?3 OFFSET ?4`,
        ...binds,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ),
      first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM renewal_tasks t WHERE ${where}`, ...binds),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      dueOn: r.due_on,
      daysLeft: Math.round((Date.parse(r.due_on) - Date.parse(today)) / 86_400_000),
      note: r.note,
      subscriptionId: r.subscription_id,
      subscriptionNumber: r.number,
      subscriptionStatus: r.sub_status,
      customerId: r.customer_id,
      customerName: r.customer,
      planName: r.plan,
      monthlyValue: fromMinor(Math.round(r.mrr)),
      renewalSubscriptionId: r.renewal_subscription_id,
      renewalNumber: r.renewal_number,
      renewalStatus: r.renewal_status,
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .post("/:id/quote", requirePermission("subscription:write"), async (c) => {
    const quotation = await quoteRenewal(c.get("db"), c.env.DB, c.req.param("id"), currentUser(c).id);
    if (!quotation) throw ApiError.notFound("Renewal task");
    return c.json({ data: quotation }, 201);
  })

  .patch(
    "/:id",
    requirePermission("subscription:write"),
    validate("json", z.object({ status: z.enum(["open", "cancelled", "expired"]), note: notesSchema })),
    async (c) => {
      const { status, note } = c.req.valid("json");
      const res = await c.env.DB.prepare(`UPDATE renewal_tasks SET status = ?1, note = COALESCE(?2, note), updated_at = ?3 WHERE id = ?4`)
        .bind(status, note ?? null, new Date().toISOString(), c.req.param("id"))
        .run();
      if (!res.meta.changes) throw ApiError.notFound("Renewal task");
      return c.json({ ok: true });
    },
  )

  .post("/scan", requirePermission("subscription:write"), async (c) =>
    c.json({ data: await scanRenewals({ db: c.get("db"), env: c.env, today: todayISO() }) }),
  );
