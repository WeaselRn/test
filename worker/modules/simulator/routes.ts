/**
 * What-if Financial Simulator baseline. Owner: Person 4.
 * Returns current aggregates only; scenarios are computed deterministically in the
 * browser (src/modules/simulator/model.ts) so assumptions stay visible.
 */
import { Hono } from "hono";
import { todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import type { AppEnv } from "../../env";
import { requirePermission } from "../../lib/auth";
import { all, first, MRR_EXPR } from "../../lib/sql";

export const simulatorRoutes = new Hono<AppEnv>().get("/baseline", requirePermission("report:read"), async (c) => {
  const [plans, totals] = await Promise.all([
    all<{ id: string; name: string; billing_period: string; subs: number; mrr: number }>(
      c.env.DB,
      `SELECT p.id, p.name, p.billing_period, COUNT(s.id) AS subs, COALESCE(SUM(${MRR_EXPR}), 0) AS mrr
       FROM plans p JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
       GROUP BY p.id ORDER BY mrr DESC`,
    ),
    first<{ customers: number; outstanding: number; overdue: number; collected90: number; billed90: number }>(
      c.env.DB,
      `SELECT (SELECT COUNT(DISTINCT customer_id) FROM subscriptions WHERE status = 'active') AS customers,
              (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE status = 'confirmed') AS outstanding,
              (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE status = 'confirmed' AND due_date < ?1) AS overdue,
              (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE paid_on >= date(?1, '-90 day')) AS collected90,
              (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE status != 'cancelled' AND issue_date >= date(?1, '-90 day')) AS billed90`,
      todayISO(),
    ),
  ]);
  const mrr = plans.reduce((a, p) => a + p.mrr, 0);
  return c.json({
    data: {
      mrr: fromMinor(Math.round(mrr)),
      activeSubscriptions: plans.reduce((a, p) => a + p.subs, 0),
      customers: totals?.customers ?? 0,
      outstanding: fromMinor(totals?.outstanding ?? 0),
      overdue: fromMinor(totals?.overdue ?? 0),
      collectionRate: totals?.billed90 ? Math.min(100, Math.round((totals.collected90 / totals.billed90) * 100)) : 100,
      plans: plans.map((p) => ({ id: p.id, name: p.name, billingPeriod: p.billing_period, subscriptions: p.subs, mrr: fromMinor(Math.round(p.mrr)) })),
    },
  });
});
