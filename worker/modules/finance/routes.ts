/**
 * Findings API for the Revenue Leakage and Invoice Anomaly pages. Owner: Person 3.
 */
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { notesSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { paginated } from "../../lib/pagination";
import { all, first } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { RULES, scanInvoiceAnomalies, scanRevenueLeakage } from "./detection";

const listSchema = listQuerySchema.extend({
  kind: z.enum(["leakage", "anomaly"]).default("leakage"),
  status: z.enum(["open", "reviewed", "resolved"]).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  rule: z.string().optional(),
});

interface FindingRow {
  id: string;
  kind: "leakage" | "anomaly";
  rule: string;
  severity: string;
  customer_id: string | null;
  customer_name: string | null;
  subscription_id: string | null;
  subscription_number: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  payment_id: string | null;
  amount_at_risk: number;
  expected: number | null;
  actual: number | null;
  explanation: string;
  suggestion: string;
  status: string;
  resolution_note: string | null;
  detected_at: string;
}

export const findingRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("finding:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const where = `f.kind = ?1 AND (?2 IS NULL OR f.status = ?2) AND (?3 IS NULL OR f.severity = ?3) AND (?4 IS NULL OR f.rule = ?4)`;
    const binds = [q.kind, q.status ?? null, q.severity ?? null, q.rule ?? null];
    const [rows, total] = await Promise.all([
      all<FindingRow>(
        c.env.DB,
        `SELECT f.*, COALESCE(c.company_name, c.contact_name) AS customer_name, s.number AS subscription_number, i.number AS invoice_number
         FROM findings f LEFT JOIN customers c ON c.id = f.customer_id LEFT JOIN subscriptions s ON s.id = f.subscription_id
         LEFT JOIN invoices i ON i.id = f.invoice_id
         WHERE ${where}
         ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END,
                  CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, f.amount_at_risk DESC
         LIMIT ?5 OFFSET ?6`,
        ...binds,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ),
      first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM findings f WHERE ${where}`, ...binds),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      rule: r.rule,
      ruleLabel: RULES[r.rule]?.label ?? r.rule,
      severity: r.severity,
      customerId: r.customer_id,
      customerName: r.customer_name,
      subscriptionId: r.subscription_id,
      subscriptionNumber: r.subscription_number,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      paymentId: r.payment_id,
      amountAtRisk: fromMinor(r.amount_at_risk),
      expected: r.expected === null ? null : fromMinor(r.expected),
      actual: r.actual === null ? null : fromMinor(r.actual),
      explanation: r.explanation,
      suggestion: r.suggestion,
      status: r.status,
      resolutionNote: r.resolution_note,
      detectedAt: r.detected_at,
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/summary", requirePermission("finding:read"), validate("query", z.object({ kind: z.enum(["leakage", "anomaly"]).default("leakage") })), async (c) => {
    const { kind } = c.req.valid("query");
    const [bySeverity, byRule] = await Promise.all([
      all<{ severity: string; count: number; amount: number }>(
        c.env.DB,
        `SELECT severity, COUNT(*) AS count, SUM(amount_at_risk) AS amount FROM findings WHERE kind = ?1 AND status != 'resolved' GROUP BY severity`,
        kind,
      ),
      all<{ rule: string; count: number; amount: number }>(
        c.env.DB,
        `SELECT rule, COUNT(*) AS count, SUM(amount_at_risk) AS amount FROM findings WHERE kind = ?1 AND status != 'resolved' GROUP BY rule ORDER BY amount DESC`,
        kind,
      ),
    ]);
    return c.json({
      totalAtRisk: fromMinor(bySeverity.reduce((a, r) => a + r.amount, 0)),
      openCount: bySeverity.reduce((a, r) => a + r.count, 0),
      bySeverity: ["critical", "high", "medium", "low"].map((s) => ({ severity: s, count: bySeverity.find((r) => r.severity === s)?.count ?? 0 })),
      byRule: byRule.map((r) => ({ rule: r.rule, label: RULES[r.rule]?.label ?? r.rule, count: r.count, amount: fromMinor(r.amount) })),
    });
  })

  .patch(
    "/:id",
    requirePermission("finding:write"),
    validate("json", z.object({ status: z.enum(["open", "reviewed", "resolved"]), resolutionNote: notesSchema })),
    async (c) => {
      const { status, resolutionNote } = c.req.valid("json");
      const res = await c.env.DB.prepare(
        `UPDATE findings SET status = ?1, resolution_note = COALESCE(?2, resolution_note), resolved_by = ?3, updated_at = ?4 WHERE id = ?5`,
      )
        .bind(status, resolutionNote ?? null, currentUser(c).id, new Date().toISOString(), c.req.param("id"))
        .run();
      if (!res.meta.changes) throw ApiError.notFound("Finding");
      return c.json({ ok: true });
    },
  )

  .post("/scan", requirePermission("finding:write"), async (c) => {
    const today = todayISO();
    const [leakage, anomalies] = await Promise.all([scanRevenueLeakage({ env: c.env, today }), scanInvoiceAnomalies({ env: c.env })]);
    return c.json({ data: { leakage: leakage.created, anomalies: anomalies.created } });
  });
