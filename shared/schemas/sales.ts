import { z } from "zod";
import {
  emailSchema,
  idSchema,
  isoDateSchema,
  moneySchema,
  nameSchema,
  notesSchema,
  positiveMoneySchema,
  quantitySchema,
} from "./common";

export const templateLineSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullable().optional(),
  quantity: quantitySchema,
});

export const quotationTemplateSchema = z.object({
  name: nameSchema,
  planId: idSchema,
  validityDays: z.coerce.number().int().min(1).max(365),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(15),
  lines: z.array(templateLineSchema).default([]),
});
export type QuotationTemplateInput = z.infer<typeof quotationTemplateSchema>;

export const customerSchema = z.object({
  contactName: nameSchema,
  email: emailSchema,
  companyName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  billingAddress: z.string().trim().max(500).optional().nullable(),
  taxId: z.string().trim().max(40).optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const subscriptionLineSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullable().optional(),
  quantity: quantitySchema,
  /** Optional override; defaults to product sales price + variant extra price. */
  unitPrice: moneySchema.optional(),
  taxId: idSchema.nullable().optional(),
});

export const subscriptionSchema = z
  .object({
    customerId: idSchema,
    planId: idSchema,
    startDate: isoDateSchema,
    expiryDate: isoDateSchema.nullable().optional(),
    paymentTermDays: z.coerce.number().int().min(0).max(365).default(15),
    lines: z.array(subscriptionLineSchema).default([]),
  })
  .refine((s) => !s.expiryDate || s.expiryDate >= s.startDate, {
    path: ["expiryDate"],
    message: "Expiry must be on or after the start date",
  });
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const subscriptionTransitionSchema = z.object({
  to: z.enum(["quotation", "confirmed", "active", "paused", "closed"]),
  note: notesSchema,
});
export type SubscriptionTransitionInput = z.infer<typeof subscriptionTransitionSchema>;

export const PAYMENT_METHODS = ["bank_transfer", "cash", "upi", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: positiveMoneySchema,
  paidOn: isoDateSchema,
  reference: z.string().trim().max(100).optional().nullable(),
  note: notesSchema,
});
export type PaymentInput = z.infer<typeof paymentSchema>;
