import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, simulate } from "../../src/modules/simulator/model";
import { scoreFromSignals } from "../../worker/modules/customers/health";

const base = { mrr: 84_000_000, activeSubscriptions: 100, customers: 80, outstanding: 1_000_000, overdue: 0, collectionRate: 90 };

describe("what-if simulator", () => {
  it("matches the spec example: +10% price, no churn", () => {
    // ₹8,40,000 MRR + 10% = ₹9,24,000
    expect(simulate(base, { ...DEFAULT_ASSUMPTIONS, priceChangePct: 10 }).mrr).toBe(92_400_000);
  });
  it("applies churn, downgrades and discounts multiplicatively and deterministically", () => {
    const r = simulate(base, { ...DEFAULT_ASSUMPTIONS, priceChangePct: 10, churnPct: 5, downgradePct: 10, downgradeImpactPct: 50, discountPct: 20, discountSharePct: 50, months: 12 });
    // 840000 × 1.1 × 0.95 × 0.95 × 0.9
    expect(r.mrr).toBe(Math.round(84_000_000 * 1.1 * 0.95 * 0.95 * 0.9));
    expect(r.subscriptions).toBe(95);
    expect(r.revenue).toBe(r.mrr * 12);
    expect(simulate(base, DEFAULT_ASSUMPTIONS).delta.mrr).toBe(0);
  });
});

describe("customer health score", () => {
  const none = { late_payments: 0, overdue_count: 0, max_days_overdue: null, expiring_no_renewal: 0, pauses: 0, pending_cancellations: 0 };
  it("is 100 and healthy with no signals", () => {
    expect(scoreFromSignals(none)).toMatchObject({ score: 100, category: "healthy", reasons: [] });
  });
  it("subtracts transparent penalties and explains each one", () => {
    const r = scoreFromSignals({ ...none, late_payments: 3, overdue_count: 1, max_days_overdue: 20 });
    expect(r.score).toBe(100 - 10 - 15 - 20);
    expect(r.category).toBe("needs_attention");
    expect(r.reasons).toHaveLength(3);
  });
  it("clamps at zero and marks at risk", () => {
    const r = scoreFromSignals({ late_payments: 5, overdue_count: 4, max_days_overdue: 60, expiring_no_renewal: 1, pauses: 4, pending_cancellations: 1 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.category).toBe("at_risk");
  });
});
