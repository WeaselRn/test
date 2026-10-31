/**
 * Pricing, discount and tax engine. Pure functions, shared by the browser, the API
 * and the billing run so every surface produces identical numbers.
 *
 * Rules (PRD §4 "Price, discount and tax order"):
 * - Unit price = product sales price + variant extra price.
 * - Line amount = quantity × unit price, minus any eligible discount, then tax is
 *   added on the discounted amount.
 * - Rounding to minor units happens per line; invoice totals are sums of rounded lines.
 * - A discount is eligible when the date is inside its window, usage is below the
 *   limit, and the minimum purchase / quantity is met. When several apply, the one
 *   giving the largest reduction wins (no stacking).
 */
import type { ISODate } from "./dates";
import { applyBasisPoints, roundMinor, sumMinor, type Minor } from "./money";

export type TaxKind = "percentage" | "fixed";
export type DiscountKind = "fixed" | "percentage";
export type DiscountScope = "product" | "subscription";

export interface TaxRule {
  id: string;
  name: string;
  kind: TaxKind;
  /** Basis points for percentage; minor units per unit for fixed. */
  rate: number;
}

export interface DiscountRule {
  id: string;
  name: string;
  kind: DiscountKind;
  /** Basis points for percentage; minor units for fixed. */
  value: number;
  minPurchase: Minor;
  minQuantity: number;
  startsOn: ISODate;
  endsOn: ISODate | null;
  usageLimit: number | null;
  usageCount: number;
  scope: DiscountScope;
  /** Product ids the discount applies to when scope is "product". */
  productIds: readonly string[];
  isActive?: boolean;
}

export interface PricingLineInput {
  description: string;
  productId: string | null;
  quantity: number;
  unitPrice: Minor;
  taxes: readonly TaxRule[];
}

export interface PricedLine extends PricingLineInput {
  gross: Minor;
  discountAmount: Minor;
  net: Minor;
  taxAmount: Minor;
  amount: Minor;
}

export interface PricedInvoice {
  lines: PricedLine[];
  subtotal: Minor;
  discountTotal: Minor;
  taxTotal: Minor;
  total: Minor;
  appliedDiscount: { id: string; name: string; amount: Minor } | null;
}

export function unitPrice(salesPrice: Minor, variantExtraPrice: Minor = 0): Minor {
  return salesPrice + variantExtraPrice;
}

/** Tax for one line, computed on the discounted (net) amount. */
export function lineTax(net: Minor, quantity: number, taxes: readonly TaxRule[]): Minor {
  return sumMinor(
    taxes.map((t) => (t.kind === "percentage" ? applyBasisPoints(net, t.rate) : roundMinor(t.rate * quantity))),
  );
}

/** Whether a discount passes its date, usage and active checks (thresholds are checked separately). */
export function isDiscountActive(d: DiscountRule, on: ISODate): boolean {
  if (d.isActive === false) return false;
  if (on < d.startsOn) return false;
  if (d.endsOn && on > d.endsOn) return false;
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return false;
  return true;
}

/**
 * Discount amount per line for one discount rule, or null when the rule is not eligible.
 * Subscription-scope discounts are allocated across lines proportionally to gross
 * (largest-remainder) so tax can be computed on each discounted line.
 */
export function discountAllocation(
  d: DiscountRule,
  lines: readonly PricingLineInput[],
  on: ISODate,
): Minor[] | null {
  if (!isDiscountActive(d, on)) return null;
  const gross = lines.map((l) => l.quantity * l.unitPrice);

  if (d.scope === "product") {
    const allowed = new Set(d.productIds);
    let any = false;
    const out = lines.map((l, i) => {
      const g = gross[i] ?? 0;
      if (!l.productId || !allowed.has(l.productId)) return 0;
      if (g < d.minPurchase || l.quantity < d.minQuantity) return 0;
      any = true;
      return d.kind === "percentage" ? applyBasisPoints(g, d.value) : Math.min(d.value, g);
    });
    return any ? out : null;
  }

  const subtotal = sumMinor(gross);
  const totalQty = sumMinor(lines.map((l) => l.quantity));
  if (subtotal <= 0 || subtotal < d.minPurchase || totalQty < d.minQuantity) return null;
  const reduction = d.kind === "percentage" ? applyBasisPoints(subtotal, d.value) : Math.min(d.value, subtotal);
  return allocateProportionally(reduction, gross);
}

/** Split `amount` across `weights` proportionally; parts sum exactly to `amount`. */
export function allocateProportionally(amount: Minor, weights: readonly Minor[]): Minor[] {
  const total = sumMinor(weights);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const floors = raw.map(Math.floor);
  let remainder = amount - sumMinor(floors);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder--;
  }
  return floors;
}

/** Pick the eligible discount with the largest total reduction (no stacking). */
export function bestDiscount(
  discounts: readonly DiscountRule[],
  lines: readonly PricingLineInput[],
  on: ISODate,
): { discount: DiscountRule; allocation: Minor[]; amount: Minor } | null {
  let best: { discount: DiscountRule; allocation: Minor[]; amount: Minor } | null = null;
  for (const d of discounts) {
    const allocation = discountAllocation(d, lines, on);
    if (!allocation) continue;
    const amount = sumMinor(allocation);
    if (amount > 0 && (!best || amount > best.amount)) best = { discount: d, allocation, amount };
  }
  return best;
}

/** Price a full invoice: per-line discount, tax on discounted amount, totals from rounded lines. */
export function priceInvoice(
  lines: readonly PricingLineInput[],
  discounts: readonly DiscountRule[],
  on: ISODate,
): PricedInvoice {
  const best = bestDiscount(discounts, lines, on);
  const priced: PricedLine[] = lines.map((l, i) => {
    const gross = l.quantity * l.unitPrice;
    const discountAmount = best?.allocation[i] ?? 0;
    const net = gross - discountAmount;
    const taxAmount = lineTax(net, l.quantity, l.taxes);
    return { ...l, gross, discountAmount, net, taxAmount, amount: net + taxAmount };
  });
  return {
    lines: priced,
    subtotal: sumMinor(priced.map((l) => l.gross)),
    discountTotal: sumMinor(priced.map((l) => l.discountAmount)),
    taxTotal: sumMinor(priced.map((l) => l.taxAmount)),
    total: sumMinor(priced.map((l) => l.amount)),
    appliedDiscount: best ? { id: best.discount.id, name: best.discount.name, amount: best.amount } : null,
  };
}

/** Monthly recurring revenue for one subscription amount (PRD §4). */
export function monthlyNormalised(amount: Minor, period: "daily" | "weekly" | "monthly" | "yearly"): Minor {
  switch (period) {
    case "monthly":
      return amount;
    case "yearly":
      return roundMinor(amount / 12);
    case "weekly":
      return roundMinor((amount * 52) / 12);
    case "daily":
      return roundMinor((amount * 365) / 12);
  }
}
