/**
 * Row → API DTO converters shared by every module, so money and computed fields
 * (balance, overdue) are serialized one way only. Owner: Person 1.
 */
import { diffDays, todayISO } from "../../shared/dates";
import { isInvoiceOverdue } from "../../shared/lifecycle";
import { fromBasisPoints, fromMinor } from "../../shared/money";
import type { Customer, Discount, Invoice, InvoiceLine, Payment, Plan, Product, Subscription, Tax } from "../../shared/types";
import type { schema } from "./db";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export function toCustomer(r: Row<typeof schema.customers>): Customer {
  return {
    id: r.id,
    userId: r.userId,
    email: r.email,
    contactName: r.contactName,
    companyName: r.companyName,
    phone: r.phone,
    billingAddress: r.billingAddress,
    taxId: r.taxId,
    createdAt: r.createdAt,
  };
}

export function toProduct(r: Row<typeof schema.products>, taxIds: string[] = []): Product {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    salesPrice: fromMinor(r.salesPrice),
    costPrice: fromMinor(r.costPrice),
    notes: r.notes,
    isActive: r.isActive,
    taxIds,
  };
}

export function toPlan(r: Row<typeof schema.plans>): Plan {
  return {
    id: r.id,
    name: r.name,
    price: fromMinor(r.price),
    billingPeriod: r.billingPeriod,
    minQuantity: r.minQuantity,
    availableFrom: r.availableFrom,
    availableTo: r.availableTo,
    autoClose: r.autoClose,
    closable: r.closable,
    pausable: r.pausable,
    renewable: r.renewable,
    status: r.status,
  };
}

export function toTax(r: Row<typeof schema.taxes>): Tax {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    rate: r.kind === "percentage" ? fromBasisPoints(r.rate) : fromMinor(r.rate),
    isActive: r.isActive,
  };
}

export function toDiscount(r: Row<typeof schema.discounts>, productIds: string[] = []): Discount {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    value: r.kind === "percentage" ? fromBasisPoints(r.value) : fromMinor(r.value),
    minPurchase: fromMinor(r.minPurchase),
    minQuantity: r.minQuantity,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    usageLimit: r.usageLimit,
    usageCount: r.usageCount,
    scope: r.scope,
    productIds,
    isActive: r.isActive,
  };
}

export function toSubscription(
  r: Row<typeof schema.subscriptions>,
  extra: { customerName?: string | null; planName?: string | null } = {},
): Subscription {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    customerName: extra.customerName ?? undefined,
    planId: r.planId,
    planName: extra.planName ?? undefined,
    status: r.status,
    startDate: r.startDate,
    expiryDate: r.expiryDate,
    nextInvoiceDate: r.nextInvoiceDate,
    paymentTermDays: r.paymentTermDays,
    quoteValidUntil: r.quoteValidUntil,
    createdAt: r.createdAt,
  };
}

export function toInvoice(
  r: Row<typeof schema.invoices>,
  extra: { customerName?: string | null; subscriptionNumber?: string | null } = {},
  today = todayISO(),
): Invoice {
  const overdue = isInvoiceOverdue(r, today);
  return {
    id: r.id,
    number: r.number,
    subscriptionId: r.subscriptionId,
    subscriptionNumber: extra.subscriptionNumber ?? undefined,
    customerId: r.customerId,
    customerName: extra.customerName ?? undefined,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    subtotal: fromMinor(r.subtotal),
    discountTotal: fromMinor(r.discountTotal),
    taxTotal: fromMinor(r.taxTotal),
    total: fromMinor(r.total),
    amountPaid: fromMinor(r.amountPaid),
    balance: fromMinor(r.status === "cancelled" ? 0 : r.total - r.amountPaid),
    isOverdue: overdue,
    daysOverdue: overdue ? diffDays(r.dueDate, today) : 0,
    sentAt: r.sentAt,
  };
}

export function toInvoiceLine(r: Row<typeof schema.invoiceLines>): InvoiceLine {
  return {
    id: r.id,
    description: r.description,
    productId: r.productId,
    quantity: r.quantity,
    unitPrice: fromMinor(r.unitPrice),
    discountAmount: fromMinor(r.discountAmount),
    taxAmount: fromMinor(r.taxAmount),
    amount: fromMinor(r.amount),
  };
}

export function toPayment(
  r: Row<typeof schema.payments>,
  extra: { invoiceNumber?: string | null; customerName?: string | null } = {},
): Payment {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    invoiceNumber: extra.invoiceNumber ?? undefined,
    customerId: r.customerId,
    customerName: extra.customerName ?? undefined,
    method: r.method,
    amount: fromMinor(r.amount),
    paidOn: r.paidOn,
    reference: r.reference,
    note: r.note,
    recordedBy: r.recordedBy,
    createdAt: r.createdAt,
  };
}

/** Display name for a customer row: company, else contact. */
export function customerLabel(c: { companyName: string | null; contactName: string } | null | undefined): string | null {
  if (!c) return null;
  return c.companyName || c.contactName;
}
