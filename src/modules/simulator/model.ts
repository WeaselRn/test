/**
 * What-if simulator model. Owner: Person 4. Pure, deterministic arithmetic on minor
 * units so results are reproducible and the formulas can be shown on screen.
 */
export interface Baseline {
  mrr: number; // minor units
  activeSubscriptions: number;
  customers: number;
  outstanding: number; // minor units
  overdue: number; // minor units
  collectionRate: number; // 0..100
}

export interface Assumptions {
  priceChangePct: number; // e.g. 10 = +10%
  churnPct: number; // share of subscriptions that cancel
  discountPct: number; // discount given…
  discountSharePct: number; // …to this share of subscriptions
  downgradePct: number; // share of subscriptions that downgrade…
  downgradeImpactPct: number; // …losing this share of their value
  recoveryImprovementPct: number; // percentage points added to the collection rate
  months: number; // projection horizon for revenue
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  priceChangePct: 0,
  churnPct: 0,
  discountPct: 0,
  discountSharePct: 0,
  downgradePct: 0,
  downgradeImpactPct: 30,
  recoveryImprovementPct: 0,
  months: 12,
};

export interface Projection {
  mrr: number;
  arr: number;
  revenue: number;
  collected: number;
  outstanding: number;
  subscriptions: number;
  customers: number;
  delta: { mrr: number; arr: number; revenue: number; subscriptions: number };
  steps: { label: string; formula: string; mrr: number }[];
}

const pct = (n: number) => n / 100;

export function simulate(b: Baseline, a: Assumptions): Projection {
  const steps: Projection["steps"] = [];
  let mrr = b.mrr;
  steps.push({ label: "Current MRR", formula: "Sum of active subscriptions, normalised to a month", mrr });

  mrr = mrr * (1 + pct(a.priceChangePct));
  steps.push({ label: "Price change", formula: `× (1 + ${a.priceChangePct}%)`, mrr });

  mrr = mrr * (1 - pct(a.churnPct));
  steps.push({ label: "Churn", formula: `× (1 − ${a.churnPct}%)`, mrr });

  mrr = mrr * (1 - pct(a.downgradePct) * pct(a.downgradeImpactPct));
  steps.push({ label: "Downgrades", formula: `× (1 − ${a.downgradePct}% × ${a.downgradeImpactPct}%)`, mrr });

  mrr = mrr * (1 - pct(a.discountSharePct) * pct(a.discountPct));
  steps.push({ label: "Discount offer", formula: `× (1 − ${a.discountSharePct}% × ${a.discountPct}%)`, mrr });

  const finalMrr = Math.round(mrr);
  const revenue = finalMrr * a.months;
  const collectionRate = Math.min(100, b.collectionRate + a.recoveryImprovementPct);
  const collected = Math.round(revenue * pct(collectionRate));
  const subscriptions = Math.round(b.activeSubscriptions * (1 - pct(a.churnPct)));
  const customers = Math.round(b.customers * (1 - pct(a.churnPct)));
  const baseRevenue = b.mrr * a.months;
  return {
    mrr: finalMrr,
    arr: finalMrr * 12,
    revenue,
    collected,
    outstanding: Math.max(0, Math.round(b.outstanding * (1 - pct(a.recoveryImprovementPct)))),
    subscriptions,
    customers,
    delta: { mrr: finalMrr - b.mrr, arr: (finalMrr - b.mrr) * 12, revenue: revenue - baseRevenue, subscriptions: subscriptions - b.activeSubscriptions },
    steps: steps.map((s) => ({ ...s, mrr: Math.round(s.mrr) })),
  };
}
