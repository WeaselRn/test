/**
 * Customer Subscription Health Score. Owner: Person 4.
 * Transparent rules: start at 100, subtract a penalty per signal, clamp to 0..100.
 * This is a rule-based score, not a statistically validated churn probability.
 */
import { addDays, todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { all } from "../../lib/sql";

export type HealthCategory = "healthy" | "needs_attention" | "at_risk";

export interface HealthResult {
  customerId: string;
  customerName: string;
  email: string;
  score: number;
  category: HealthCategory;
  reasons: { signal: string; penalty: number }[];
  nextAction: string;
  activeSubscriptions: number;
  outstanding: string;
}

interface SignalRow {
  late_payments: number;
  overdue_count: number;
  max_days_overdue: number | null;
  expiring_no_renewal: number;
  pauses: number;
  pending_cancellations: number;
}

/** Penalties are configurable here; tune them with the demo data. */
export const PENALTIES = {
  latePayment: 10,
  repeatedLatePayments: 15,
  overdue: 10,
  significantlyOverdue: 20,
  expiringWithoutRenewal: 10,
  pause: 5,
  cancellationRequested: 15,
};

export function scoreFromSignals(s: SignalRow) {
  const reasons: { signal: string; penalty: number }[] = [];
  if (s.late_payments >= 1) reasons.push({ signal: `${s.late_payments} late payment${s.late_payments > 1 ? "s" : ""} in the last 180 days`, penalty: PENALTIES.latePayment });
  if (s.late_payments >= 2) reasons.push({ signal: "Repeated late payments", penalty: PENALTIES.repeatedLatePayments });
  if (s.overdue_count > 0) {
    const significant = (s.max_days_overdue ?? 0) > 14;
    reasons.push({
      signal: significant
        ? `Invoice overdue by ${s.max_days_overdue} days`
        : `${s.overdue_count} overdue invoice${s.overdue_count > 1 ? "s" : ""}`,
      penalty: significant ? PENALTIES.significantlyOverdue : PENALTIES.overdue,
    });
  }
  if (s.expiring_no_renewal > 0) reasons.push({ signal: "Subscription expiring within 30 days without a renewal", penalty: PENALTIES.expiringWithoutRenewal });
  if (s.pauses > 0) reasons.push({ signal: `${s.pauses} pause${s.pauses > 1 ? "s" : ""} in the last 180 days`, penalty: Math.min(s.pauses * PENALTIES.pause, 10) });
  if (s.pending_cancellations > 0) reasons.push({ signal: "Cancellation requested", penalty: PENALTIES.cancellationRequested });
  const score = Math.max(0, Math.min(100, 100 - reasons.reduce((a, r) => a + r.penalty, 0)));
  const category: HealthCategory = score >= 80 ? "healthy" : score >= 50 ? "needs_attention" : "at_risk";
  const nextAction =
    s.pending_cancellations > 0
      ? "Call the customer about their cancellation request and offer an alternative plan."
      : (s.max_days_overdue ?? 0) > 14
        ? "Escalate the overdue invoice and agree a payment date."
        : s.expiring_no_renewal > 0
          ? "Prepare a renewal quotation."
          : s.late_payments >= 2
            ? "Suggest automatic payment or shorter payment terms."
            : s.overdue_count > 0
              ? "Send a friendly payment reminder."
              : "No action needed.";
  return { score, category, reasons, nextAction };
}

/**
 * Health for one customer, or for all customers when `customerId` is omitted.
 * Each signal is one GROUP BY query (linear in table size), merged in memory, so the
 * all-customers view stays fast with thousands of customers.
 */
export async function computeHealth(d1: D1Database, customerId?: string, today = todayISO()): Promise<HealthResult[]> {
  const since = addDays(today, -180);
  const id = customerId ?? null;
  type Agg = { customer_id: string; n: number; m?: number | null };
  const [customers, active, late, overdue, outstanding, expiring, pauses, cancels] = await Promise.all([
    all<{ id: string; name: string; email: string }>(
      d1,
      `SELECT id, COALESCE(company_name, contact_name) AS name, email FROM customers WHERE (?1 IS NULL OR id = ?1)`,
      id,
    ),
    all<Agg>(d1, `SELECT customer_id, COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND (?1 IS NULL OR customer_id = ?1) GROUP BY customer_id`, id),
    all<Agg>(
      d1,
      `SELECT i.customer_id, COUNT(*) AS n FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.paid_on > i.due_date AND p.paid_on >= ?2 AND (?1 IS NULL OR i.customer_id = ?1) GROUP BY i.customer_id`,
      id,
      since,
    ),
    all<Agg>(
      d1,
      `SELECT customer_id, COUNT(*) AS n, MAX(CAST(julianday(?2) - julianday(due_date) AS INTEGER)) AS m FROM invoices
       WHERE status = 'confirmed' AND due_date < ?2 AND total > amount_paid AND (?1 IS NULL OR customer_id = ?1) GROUP BY customer_id`,
      id,
      today,
    ),
    all<Agg>(
      d1,
      `SELECT customer_id, SUM(total - amount_paid) AS n FROM invoices WHERE status = 'confirmed' AND (?1 IS NULL OR customer_id = ?1) GROUP BY customer_id`,
      id,
    ),
    all<Agg>(
      d1,
      `SELECT s.customer_id, COUNT(*) AS n FROM subscriptions s
       WHERE s.status = 'active' AND s.expiry_date BETWEEN ?2 AND ?3 AND (?1 IS NULL OR s.customer_id = ?1)
         AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r.renewed_from_id = s.id AND r.status != 'closed')
       GROUP BY s.customer_id`,
      id,
      today,
      addDays(today, 30),
    ),
    all<Agg>(
      d1,
      `SELECT s.customer_id, COUNT(*) AS n FROM subscription_status_history h JOIN subscriptions s ON s.id = h.subscription_id
       WHERE h.to_status = 'paused' AND h.created_at >= ?2 AND (?1 IS NULL OR s.customer_id = ?1) GROUP BY s.customer_id`,
      id,
      since,
    ),
    all<Agg>(d1, `SELECT customer_id, COUNT(*) AS n FROM cancellation_requests WHERE outcome = 'pending' AND (?1 IS NULL OR customer_id = ?1) GROUP BY customer_id`, id),
  ]);
  const map = (rows: Agg[]) => new Map(rows.map((r) => [r.customer_id, r]));
  const [a, l, o, out, e, p, cx] = [active, late, overdue, outstanding, expiring, pauses, cancels].map(map);
  return customers.map((c) => {
    const signals = {
      late_payments: l!.get(c.id)?.n ?? 0,
      overdue_count: o!.get(c.id)?.n ?? 0,
      max_days_overdue: o!.get(c.id)?.m ?? null,
      expiring_no_renewal: e!.get(c.id)?.n ?? 0,
      pauses: p!.get(c.id)?.n ?? 0,
      pending_cancellations: cx!.get(c.id)?.n ?? 0,
    };
    return {
      customerId: c.id,
      customerName: c.name,
      email: c.email,
      activeSubscriptions: a!.get(c.id)?.n ?? 0,
      outstanding: fromMinor(out!.get(c.id)?.n ?? 0),
      ...scoreFromSignals(signals),
    };
  });
}
