/**
 * Revenue Leakage Detector and Invoice Anomaly Detection. Owner: Person 3.
 * Deterministic SQL rules; no AI. Each finding has a stable fingerprint, so a rescan
 * never duplicates it. Amounts are "potential revenue at risk" until verified.
 */
import { todayISO, addDays } from "../../../shared/dates";
import type { FindingSeverity } from "../../../shared/types";
import { newId } from "../../lib/db";
import type { JobContext } from "../../jobs/scheduler";
import { money } from "../../lib/format";
import { all, MRR_EXPR } from "../../lib/sql";

interface Candidate {
  kind: "leakage" | "anomaly";
  rule: string;
  severity: FindingSeverity;
  key: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  amountAtRisk: number;
  expected?: number | null;
  actual?: number | null;
  explanation: string;
  suggestion: string;
}

export const RULES: Record<string, { kind: "leakage" | "anomaly"; label: string }> = {
  missing_invoice: { kind: "leakage", label: "Billing period not invoiced" },
  unmatched_payment: { kind: "leakage", label: "Payment not matched to an invoice" },
  expired_discount_used: { kind: "leakage", label: "Discount applied outside its dates" },
  discount_over_limit: { kind: "leakage", label: "Discount used beyond its limit" },
  expiring_no_renewal: { kind: "leakage", label: "Expiring without a renewal" },
  overdue_unreminded: { kind: "leakage", label: "Overdue invoice never chased" },
  total_mismatch: { kind: "anomaly", label: "Total does not match lines" },
  discount_exceeds_subtotal: { kind: "anomaly", label: "Discount exceeds subtotal" },
  closed_subscription_invoice: { kind: "anomaly", label: "Invoice for a closed subscription" },
  amount_jump: { kind: "anomaly", label: "Unusual change from previous period" },
  customer_mismatch: { kind: "anomaly", label: "Customer reference mismatch" },
};

async function leakageCandidates(d1: D1Database, today: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const behind = await all<{ id: string; number: string; customer_id: string; next_invoice_date: string; mrr: number }>(
    d1,
    `SELECT s.id, s.number, s.customer_id, s.next_invoice_date, ${MRR_EXPR} AS mrr
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.next_invoice_date IS NOT NULL AND s.next_invoice_date < ?1`,
    today,
  );
  for (const s of behind) {
    out.push({
      kind: "leakage",
      rule: "missing_invoice",
      severity: "critical",
      key: `${s.id}:${s.next_invoice_date}`,
      customerId: s.customer_id,
      subscriptionId: s.id,
      amountAtRisk: Math.round(s.mrr),
      explanation: `${s.number} is active but its period starting ${s.next_invoice_date} has no invoice.`,
      suggestion: "Run billing now. If the run fails for this subscription, check its lines and plan.",
    });
  }

  const unmatched = await all<{ id: string; amount: number; customer_id: string | null; paid_on: string; reference: string | null }>(
    d1,
    `SELECT id, amount, customer_id, paid_on, reference FROM payments WHERE invoice_id IS NULL`,
  );
  for (const p of unmatched) {
    out.push({
      kind: "leakage",
      rule: "unmatched_payment",
      severity: "high",
      key: p.id,
      customerId: p.customer_id,
      paymentId: p.id,
      amountAtRisk: p.amount,
      explanation: `${money(p.amount)} received on ${p.paid_on}${p.reference ? ` (ref ${p.reference})` : ""} is not linked to any invoice, so the customer's balance is overstated.`,
      suggestion: "Match the payment to the customer's open invoice from the Payments page.",
    });
  }

  const outsideDates = await all<{ id: string; invoice_id: string; number: string; customer_id: string; amount: number; name: string; issue_date: string }>(
    d1,
    `SELECT r.id, r.invoice_id, i.number, i.customer_id, r.amount, d.name, i.issue_date
     FROM discount_redemptions r JOIN discounts d ON d.id = r.discount_id JOIN invoices i ON i.id = r.invoice_id
     WHERE r.released_at IS NULL AND i.status != 'cancelled' AND (i.issue_date < d.starts_on OR (d.ends_on IS NOT NULL AND i.issue_date > d.ends_on))`,
  );
  for (const r of outsideDates) {
    out.push({
      kind: "leakage",
      rule: "expired_discount_used",
      severity: "medium",
      key: r.id,
      customerId: r.customer_id,
      invoiceId: r.invoice_id,
      amountAtRisk: r.amount,
      explanation: `"${r.name}" reduced ${r.number} by ${money(r.amount)} although the invoice date ${r.issue_date} is outside the discount's dates.`,
      suggestion: "If the invoice is still a draft, edit it; otherwise review the discount dates.",
    });
  }

  const overLimit = await all<{ id: string; name: string; usage_count: number; usage_limit: number; over_amount: number }>(
    d1,
    `SELECT d.id, d.name, d.usage_count, d.usage_limit,
            CAST(ROUND((d.usage_count - d.usage_limit) * COALESCE((SELECT AVG(r.amount) FROM discount_redemptions r
              WHERE r.discount_id = d.id AND r.released_at IS NULL), 0)) AS INTEGER) AS over_amount
     FROM discounts d WHERE d.usage_limit IS NOT NULL AND d.usage_count > d.usage_limit`,
  );
  for (const d of overLimit) {
    out.push({
      kind: "leakage",
      rule: "discount_over_limit",
      severity: "medium",
      key: `${d.id}:${d.usage_count}`,
      amountAtRisk: d.over_amount,
      explanation: `"${d.name}" has been used ${d.usage_count} times against a limit of ${d.usage_limit}.`,
      suggestion: "Deactivate the discount or raise its limit deliberately.",
    });
  }

  const expiring = await all<{ id: string; number: string; customer_id: string; expiry_date: string; mrr: number }>(
    d1,
    `SELECT s.id, s.number, s.customer_id, s.expiry_date, ${MRR_EXPR} AS mrr
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.expiry_date BETWEEN ?1 AND ?2
       AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r.renewed_from_id = s.id AND r.status NOT IN ('closed'))`,
    today,
    addDays(today, 30),
  );
  for (const s of expiring) {
    out.push({
      kind: "leakage",
      rule: "expiring_no_renewal",
      severity: s.expiry_date <= addDays(today, 7) ? "high" : "low",
      key: `${s.id}:${s.expiry_date}`,
      customerId: s.customer_id,
      subscriptionId: s.id,
      amountAtRisk: Math.round(s.mrr),
      explanation: `${s.number} expires on ${s.expiry_date} and has no renewal quotation.`,
      suggestion: "Prepare a renewal quotation from the Renewals page.",
    });
  }

  const unchased = await all<{ id: string; number: string; customer_id: string; balance: number; due_date: string }>(
    d1,
    `SELECT i.id, i.number, i.customer_id, i.total - i.amount_paid AS balance, i.due_date FROM invoices i
     WHERE i.status = 'confirmed' AND i.due_date < ?1 AND i.total > i.amount_paid
       AND NOT EXISTS (SELECT 1 FROM payment_reminders r WHERE r.invoice_id = i.id)`,
    addDays(today, -7),
  );
  for (const i of unchased) {
    out.push({
      kind: "leakage",
      rule: "overdue_unreminded",
      severity: "high",
      key: i.id,
      customerId: i.customer_id,
      invoiceId: i.id,
      amountAtRisk: i.balance,
      explanation: `${i.number} has been overdue since ${i.due_date} and no reminder has been sent.`,
      suggestion: "Check the dunning schedule and send a reminder.",
    });
  }
  return out;
}

async function anomalyCandidates(d1: D1Database): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const mismatched = await all<{ id: string; number: string; customer_id: string; subscription_id: string; total: number; expected: number; lines: number; subtotal: number; discount_total: number }>(
    d1,
    `SELECT i.id, i.number, i.customer_id, i.subscription_id, i.total, i.subtotal, i.discount_total,
            i.subtotal - i.discount_total + i.tax_total AS expected,
            COALESCE((SELECT SUM(amount) FROM invoice_lines l WHERE l.invoice_id = i.id), 0) AS lines
     FROM invoices i WHERE i.status != 'cancelled'
       AND (i.total != i.subtotal - i.discount_total + i.tax_total
            OR i.total != COALESCE((SELECT SUM(amount) FROM invoice_lines l WHERE l.invoice_id = i.id), 0)
            OR i.discount_total > i.subtotal)`,
  );
  for (const i of mismatched) {
    if (i.discount_total > i.subtotal) {
      out.push({
        kind: "anomaly",
        rule: "discount_exceeds_subtotal",
        severity: "high",
        key: i.id,
        customerId: i.customer_id,
        subscriptionId: i.subscription_id,
        invoiceId: i.id,
        amountAtRisk: i.discount_total - i.subtotal,
        expected: i.subtotal,
        actual: i.discount_total,
        explanation: `${i.number} has a discount of ${money(i.discount_total)} on a subtotal of ${money(i.subtotal)}.`,
        suggestion: "Correct the discount on the draft or cancel and reissue the invoice.",
      });
    } else {
      out.push({
        kind: "anomaly",
        rule: "total_mismatch",
        severity: "critical",
        key: i.id,
        customerId: i.customer_id,
        subscriptionId: i.subscription_id,
        invoiceId: i.id,
        amountAtRisk: Math.abs(i.expected - i.total),
        expected: i.lines,
        actual: i.total,
        explanation: `${i.number} totals ${money(i.total)}, but its lines add up to ${money(i.lines)} and subtotal − discount + tax is ${money(i.expected)}.`,
        suggestion: "Cancel and reissue the invoice; check for manual database edits.",
      });
    }
  }

  const closed = await all<{ id: string; number: string; customer_id: string; subscription_id: string; balance: number; period_start: string; closed_on: string }>(
    d1,
    `SELECT i.id, i.number, i.customer_id, i.subscription_id, i.total - i.amount_paid AS balance, i.period_start,
            (SELECT MIN(substr(h.created_at, 1, 10)) FROM subscription_status_history h WHERE h.subscription_id = s.id AND h.to_status = 'closed') AS closed_on
     FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
     WHERE s.status = 'closed' AND i.status IN ('draft','confirmed')
       AND i.period_start > (SELECT MIN(substr(h.created_at, 1, 10)) FROM subscription_status_history h WHERE h.subscription_id = s.id AND h.to_status = 'closed')`,
  );
  for (const i of closed) {
    out.push({
      kind: "anomaly",
      rule: "closed_subscription_invoice",
      severity: "high",
      key: i.id,
      customerId: i.customer_id,
      subscriptionId: i.subscription_id,
      invoiceId: i.id,
      amountAtRisk: i.balance,
      explanation: `${i.number} bills the period from ${i.period_start}, after the subscription closed on ${i.closed_on}.`,
      suggestion: "Cancel the invoice unless the customer agreed to the extra period.",
    });
  }

  const jumps = await all<{ id: string; number: string; customer_id: string; subscription_id: string; total: number; prev: number }>(
    d1,
    `SELECT i.id, i.number, i.customer_id, i.subscription_id, i.total,
            (SELECT p.total FROM invoices p WHERE p.subscription_id = i.subscription_id AND p.period_start < i.period_start AND p.status != 'cancelled'
             ORDER BY p.period_start DESC LIMIT 1) AS prev
     FROM invoices i WHERE i.status IN ('draft','confirmed') AND i.issue_date >= ?1`,
    addDays(todayISO(), -90),
  );
  for (const i of jumps) {
    if (!i.prev || i.prev <= 0) continue;
    const change = (i.total - i.prev) / i.prev;
    if (Math.abs(change) < 0.5) continue;
    out.push({
      kind: "anomaly",
      rule: "amount_jump",
      severity: "medium",
      key: i.id,
      customerId: i.customer_id,
      subscriptionId: i.subscription_id,
      invoiceId: i.id,
      amountAtRisk: Math.abs(i.total - i.prev),
      expected: i.prev,
      actual: i.total,
      explanation: `${i.number} is ${Math.round(change * 100)}% ${change > 0 ? "higher" : "lower"} than the previous period (${money(i.prev)} → ${money(i.total)}).`,
      suggestion: "Confirm the change is intended (quantity change, expired discount) before sending. This is an alert, not proof of an error.",
    });
  }

  const wrongCustomer = await all<{ id: string; number: string; customer_id: string; subscription_id: string; balance: number }>(
    d1,
    `SELECT i.id, i.number, i.customer_id, i.subscription_id, i.total - i.amount_paid AS balance
     FROM invoices i LEFT JOIN subscriptions s ON s.id = i.subscription_id
     WHERE s.id IS NULL OR s.customer_id != i.customer_id`,
  );
  for (const i of wrongCustomer) {
    out.push({
      kind: "anomaly",
      rule: "customer_mismatch",
      severity: "high",
      key: i.id,
      customerId: i.customer_id,
      invoiceId: i.id,
      amountAtRisk: i.balance,
      explanation: `${i.number} is billed to a different customer than its subscription, or its subscription is missing.`,
      suggestion: "Cancel and reissue the invoice to the correct customer.",
    });
  }
  return out;
}

async function save(d1: D1Database, candidates: Candidate[]): Promise<number> {
  if (!candidates.length) return 0;
  const stmt = d1.prepare(
    `INSERT OR IGNORE INTO findings (id, kind, rule, severity, fingerprint, customer_id, subscription_id, invoice_id, payment_id,
       amount_at_risk, expected, actual, explanation, suggestion)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
  );
  let created = 0;
  for (let i = 0; i < candidates.length; i += 50) {
    const res = await d1.batch(
      candidates.slice(i, i + 50).map((f) =>
        stmt.bind(
          newId(),
          f.kind,
          f.rule,
          f.severity,
          `${f.rule}:${f.key}`,
          f.customerId ?? null,
          f.subscriptionId ?? null,
          f.invoiceId ?? null,
          f.paymentId ?? null,
          f.amountAtRisk,
          f.expected ?? null,
          f.actual ?? null,
          f.explanation,
          f.suggestion,
        ),
      ),
    );
    created += res.reduce((a, r) => a + (r.meta.changes ?? 0), 0);
  }
  return created;
}

export async function scanRevenueLeakage({ env, today }: Pick<JobContext, "env" | "today">) {
  return { created: await save(env.DB, await leakageCandidates(env.DB, today)) };
}

export async function scanInvoiceAnomalies({ env }: Pick<JobContext, "env">) {
  return { created: await save(env.DB, await anomalyCandidates(env.DB)) };
}
