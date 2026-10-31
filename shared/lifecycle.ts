/**
 * Subscription and invoice state machines (PRD §4). The API enforces these through
 * explicit action endpoints; the UI uses them to decide which buttons to show.
 */

export const SUBSCRIPTION_STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "confirmed", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface PlanSwitches {
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
}

/** Forward-only moves, plus Active ↔ Paused when the plan is pausable. */
const SUBSCRIPTION_MOVES: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  draft: ["quotation", "closed"],
  quotation: ["confirmed", "closed"],
  confirmed: ["active", "closed"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  plan: PlanSwitches,
  ctx: { today: string; quoteValidUntil?: string | null } = { today: "" },
): TransitionCheck {
  if (!SUBSCRIPTION_MOVES[from].includes(to)) {
    return { ok: false, reason: `Cannot move a subscription from ${from} to ${to}.` };
  }
  if (to === "paused" && !plan.pausable) return { ok: false, reason: "This plan does not allow pausing." };
  if (to === "closed" && from === "active" && !plan.closable) {
    return { ok: false, reason: "This plan does not allow closing early." };
  }
  if (from === "quotation" && to === "confirmed" && ctx.quoteValidUntil && ctx.today > ctx.quoteValidUntil) {
    return { ok: false, reason: "This quotation has expired and cannot be confirmed." };
  }
  return { ok: true };
}

export function nextSubscriptionStatuses(from: SubscriptionStatus, plan: PlanSwitches): SubscriptionStatus[] {
  return SUBSCRIPTION_MOVES[from].filter((to) => canTransitionSubscription(from, to, plan).ok);
}

const INVOICE_MOVES: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_MOVES[from].includes(to);
}

/** Overdue = Confirmed, past due date, balance above zero. */
export function isInvoiceOverdue(
  inv: { status: InvoiceStatus; dueDate: string; total: number; amountPaid: number },
  today: string,
): boolean {
  return inv.status === "confirmed" && inv.dueDate < today && inv.total - inv.amountPaid > 0;
}
