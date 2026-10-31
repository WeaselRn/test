import { describe, expect, it } from "vitest";
import { addMonths, periodEnd, periodStart } from "../../shared/dates";
import { canTransitionSubscription, isInvoiceOverdue } from "../../shared/lifecycle";
import { fromMinor, toMinor } from "../../shared/money";
import { can } from "../../shared/permissions";
import {
  allocateProportionally,
  monthlyNormalised,
  priceInvoice,
  unitPrice,
  type DiscountRule,
  type PricingLineInput,
  type TaxRule,
} from "../../shared/pricing";
import { passwordSchema } from "../../shared/schemas";

const gst18: TaxRule = { id: "t1", name: "GST 18%", kind: "percentage", rate: 1800 };

const discount = (over: Partial<DiscountRule>): DiscountRule => ({
  id: "d",
  name: "D",
  kind: "percentage",
  value: 1000,
  minPurchase: 0,
  minQuantity: 0,
  startsOn: "2026-01-01",
  endsOn: null,
  usageLimit: null,
  usageCount: 0,
  scope: "subscription",
  productIds: [],
  ...over,
});

describe("money", () => {
  it("round-trips strings and minor units", () => {
    expect(toMinor("2560")).toBe(256000);
    expect(toMinor("2560.5")).toBe(256050);
    expect(toMinor("0.07")).toBe(7);
    expect(fromMinor(256050)).toBe("2560.50");
    expect(fromMinor(-5)).toBe("-0.05");
    expect(() => toMinor("1.234")).toThrow();
  });
});

describe("pricing", () => {
  it("adds the variant extra price to the base price (PRD example)", () => {
    expect(unitPrice(toMinor("2000"), toMinor("560"))).toBe(toMinor("2560"));
  });

  it("applies tax on the discounted line and rounds per line", () => {
    const lines: PricingLineInput[] = [
      { description: "A", productId: "p1", quantity: 3, unitPrice: 333, taxes: [gst18] },
    ];
    const r = priceInvoice(lines, [discount({ value: 1000 })], "2026-06-01");
    // gross 999, 10% = 99.9 -> 100, net 899, tax 18% = 161.82 -> 162
    expect(r.lines[0]).toMatchObject({ gross: 999, discountAmount: 100, net: 899, taxAmount: 162, amount: 1061 });
    expect(r.total).toBe(1061);
  });

  it("picks the single largest eligible discount (no stacking)", () => {
    const lines: PricingLineInput[] = [
      { description: "A", productId: "p1", quantity: 1, unitPrice: 10_000, taxes: [] },
    ];
    const r = priceInvoice(
      lines,
      [discount({ id: "pct", value: 1000 }), discount({ id: "fix", kind: "fixed", value: 1500 })],
      "2026-06-01",
    );
    expect(r.appliedDiscount?.id).toBe("fix");
    expect(r.discountTotal).toBe(1500);
  });

  it("skips expired, exhausted and below-threshold discounts", () => {
    const lines: PricingLineInput[] = [
      { description: "A", productId: "p1", quantity: 1, unitPrice: 10_000, taxes: [] },
    ];
    const on = "2026-06-01";
    expect(priceInvoice(lines, [discount({ endsOn: "2026-05-31" })], on).appliedDiscount).toBeNull();
    expect(priceInvoice(lines, [discount({ usageLimit: 5, usageCount: 5 })], on).appliedDiscount).toBeNull();
    expect(priceInvoice(lines, [discount({ minPurchase: 20_000 })], on).appliedDiscount).toBeNull();
    expect(priceInvoice(lines, [discount({ minQuantity: 2 })], on).appliedDiscount).toBeNull();
    expect(priceInvoice(lines, [discount({ startsOn: "2026-07-01" })], on).appliedDiscount).toBeNull();
  });

  it("applies product-scope discounts only to listed products", () => {
    const lines: PricingLineInput[] = [
      { description: "A", productId: "p1", quantity: 1, unitPrice: 10_000, taxes: [] },
      { description: "B", productId: "p2", quantity: 1, unitPrice: 10_000, taxes: [] },
    ];
    const r = priceInvoice(lines, [discount({ scope: "product", productIds: ["p2"] })], "2026-06-01");
    expect(r.lines.map((l) => l.discountAmount)).toEqual([0, 1000]);
  });

  it("allocates subscription discounts so parts sum exactly", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.sort()).toEqual([33, 33, 34]);
  });

  it("never discounts more than the line with a fixed amount", () => {
    const lines: PricingLineInput[] = [
      { description: "A", productId: "p1", quantity: 1, unitPrice: 500, taxes: [] },
    ];
    const r = priceInvoice(lines, [discount({ kind: "fixed", value: 10_000 })], "2026-06-01");
    expect(r.total).toBe(0);
  });

  it("normalises MRR by billing period", () => {
    expect(monthlyNormalised(1200, "yearly")).toBe(100);
    expect(monthlyNormalised(1200, "monthly")).toBe(1200);
    expect(monthlyNormalised(1200, "weekly")).toBe(5200);
    expect(monthlyNormalised(100, "daily")).toBe(3042);
  });
});

describe("dates", () => {
  it("clamps month-end dates without drifting", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(periodStart("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(periodEnd("2026-01-31", "monthly", 0)).toBe("2026-02-27");
    expect(periodStart("2026-01-01", "weekly", 2)).toBe("2026-01-15");
    expect(periodStart("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });
});

describe("lifecycle", () => {
  const plan = { closable: true, pausable: false, renewable: true };
  it("allows only forward moves", () => {
    expect(canTransitionSubscription("draft", "quotation", plan).ok).toBe(true);
    expect(canTransitionSubscription("active", "draft", plan).ok).toBe(false);
  });
  it("respects plan switches", () => {
    expect(canTransitionSubscription("active", "paused", plan).ok).toBe(false);
    expect(canTransitionSubscription("active", "paused", { ...plan, pausable: true }).ok).toBe(true);
    expect(canTransitionSubscription("active", "closed", { ...plan, closable: false }).ok).toBe(false);
  });
  it("blocks confirming an expired quotation", () => {
    const r = canTransitionSubscription("quotation", "confirmed", plan, {
      today: "2026-06-10",
      quoteValidUntil: "2026-06-09",
    });
    expect(r.ok).toBe(false);
  });
  it("detects overdue invoices", () => {
    const inv = { status: "confirmed" as const, dueDate: "2026-06-01", total: 100, amountPaid: 0 };
    expect(isInvoiceOverdue(inv, "2026-06-02")).toBe(true);
    expect(isInvoiceOverdue({ ...inv, amountPaid: 100 }, "2026-06-02")).toBe(false);
    expect(isInvoiceOverdue(inv, "2026-06-01")).toBe(false);
  });
});

describe("permissions and validation", () => {
  it("restricts staff management to admin", () => {
    expect(can("admin", "staff:manage")).toBe(true);
    expect(can("staff", "staff:manage")).toBe(false);
    expect(can("customer", "invoice:read")).toBe(false);
  });
  it("enforces the password rules", () => {
    expect(passwordSchema.safeParse("Short!1a").success).toBe(false); // 8 chars, needs more than 8
    expect(passwordSchema.safeParse("longenough!").success).toBe(false); // no uppercase
    expect(passwordSchema.safeParse("LongEnough1").success).toBe(false); // no special
    expect(passwordSchema.safeParse("LongEnough!").success).toBe(true);
  });
});
