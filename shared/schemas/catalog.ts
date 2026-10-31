import { z } from "zod";
import { idSchema, isoDateSchema, moneySchema, nameSchema, notesSchema, percentSchema } from "./common";

export const PRODUCT_TYPES = ["service", "goods", "software"] as const;
export const BILLING_PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;

export const productSchema = z.object({
  name: nameSchema,
  type: z.enum(PRODUCT_TYPES),
  salesPrice: moneySchema,
  costPrice: moneySchema.default("0.00"),
  notes: notesSchema,
  isActive: z.boolean().default(true),
  taxIds: z.array(idSchema).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const variantSchema = z.object({
  attribute: nameSchema,
  value: nameSchema,
  extraPrice: moneySchema.default("0.00"),
});
export type VariantInput = z.infer<typeof variantSchema>;

export const planSchema = z
  .object({
    name: nameSchema,
    price: moneySchema,
    billingPeriod: z.enum(BILLING_PERIODS),
    minQuantity: z.coerce.number().int().min(1).default(1),
    availableFrom: isoDateSchema,
    availableTo: isoDateSchema.nullable().optional(),
    autoClose: z.boolean().default(false),
    closable: z.boolean().default(true),
    pausable: z.boolean().default(false),
    renewable: z.boolean().default(true),
  })
  .refine((p) => !p.availableTo || p.availableTo >= p.availableFrom, {
    path: ["availableTo"],
    message: "End date must be on or after the start date",
  });
export type PlanInput = z.infer<typeof planSchema>;

export const taxSchema = z
  .object({
    name: nameSchema,
    kind: z.enum(["percentage", "fixed"]),
    /** Percentage (e.g. "18") or fixed amount per unit (e.g. "25.00"). */
    rate: z.string().trim(),
    isActive: z.boolean().default(true),
  })
  .superRefine((t, ctx) => {
    const r = t.kind === "percentage" ? percentSchema.safeParse(t.rate) : moneySchema.safeParse(t.rate);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["rate"], message: r.error.issues[0]?.message ?? "Invalid" });
  });
export type TaxInput = z.infer<typeof taxSchema>;

export const discountSchema = z
  .object({
    name: nameSchema,
    kind: z.enum(["fixed", "percentage"]),
    /** Percentage (e.g. "10") or fixed amount (e.g. "500.00"). */
    value: z.string().trim(),
    minPurchase: moneySchema.default("0.00"),
    minQuantity: z.coerce.number().int().min(0).default(0),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema.nullable().optional(),
    usageLimit: z.coerce.number().int().min(1).nullable().optional(),
    scope: z.enum(["product", "subscription"]),
    productIds: z.array(idSchema).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    const r = d.kind === "percentage" ? percentSchema.safeParse(d.value) : moneySchema.safeParse(d.value);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["value"], message: r.error.issues[0]?.message ?? "Invalid" });
    if (d.endsOn && d.endsOn < d.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after the start date" });
    }
    if (d.scope === "product" && d.productIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product" });
    }
  });
export type DiscountInput = z.infer<typeof discountSchema>;
