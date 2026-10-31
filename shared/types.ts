/**
 * API response shapes (DTOs) shared by the worker and the web app.
 * Money fields are strings with 2 decimals; percentages are strings ("18.00").
 * Do not redefine these in a module. Change them through a reviewed PR and update
 * docs/api-contracts.md.
 */
import type { ISODate } from "./dates";
import type { InvoiceStatus, SubscriptionStatus } from "./lifecycle";
import type { Role } from "./permissions";
import type { BillingPeriod } from "./dates";
import type { PaymentMethod } from "./schemas/sales";

export type Money = string;
export type Timestamp = string;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  customerId: string | null;
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: Exclude<Role, "customer">;
  isActive: boolean;
  createdAt: Timestamp;
}

export interface Customer {
  id: string;
  userId: string | null;
  email: string;
  contactName: string;
  companyName: string | null;
  phone: string | null;
  billingAddress: string | null;
  taxId: string | null;
  createdAt: Timestamp;
}

export interface ProductVariant {
  id: string;
  productId: string;
  attribute: string;
  value: string;
  extraPrice: Money;
}

export interface Product {
  id: string;
  name: string;
  type: "service" | "goods" | "software";
  salesPrice: Money;
  costPrice: Money;
  notes: string | null;
  isActive: boolean;
  taxIds: string[];
  variants?: ProductVariant[];
}

export interface Plan {
  id: string;
  name: string;
  price: Money;
  billingPeriod: BillingPeriod;
  minQuantity: number;
  availableFrom: ISODate;
  availableTo: ISODate | null;
  autoClose: boolean;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
  status: "active" | "closed";
}

export interface Tax {
  id: string;
  name: string;
  kind: "percentage" | "fixed";
  rate: string;
  isActive: boolean;
}

export interface Discount {
  id: string;
  name: string;
  kind: "fixed" | "percentage";
  value: string;
  minPurchase: Money;
  minQuantity: number;
  startsOn: ISODate;
  endsOn: ISODate | null;
  usageLimit: number | null;
  usageCount: number;
  scope: "product" | "subscription";
  productIds: string[];
  isActive: boolean;
}

export interface QuotationTemplateLine {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}

export interface QuotationTemplate {
  id: string;
  name: string;
  planId: string;
  validityDays: number;
  paymentTermDays: number;
  lines: QuotationTemplateLine[];
}

export interface SubscriptionLine {
  id: string;
  productId: string;
  productName?: string;
  variantId: string | null;
  quantity: number;
  unitPrice: Money;
  taxId: string | null;
  discountId: string | null;
  amount: Money;
}

export interface Subscription {
  id: string;
  number: string;
  customerId: string;
  customerName?: string;
  planId: string;
  planName?: string;
  status: SubscriptionStatus;
  startDate: ISODate;
  expiryDate: ISODate | null;
  nextInvoiceDate: ISODate | null;
  paymentTermDays: number;
  quoteValidUntil: ISODate | null;
  createdAt: Timestamp;
  lines?: SubscriptionLine[];
}

export interface SubscriptionStatusChange {
  id: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  actorName: string | null;
  note: string | null;
  createdAt: Timestamp;
}

export interface InvoiceLine {
  id: string;
  description: string;
  productId: string | null;
  quantity: number;
  unitPrice: Money;
  discountAmount: Money;
  taxAmount: Money;
  amount: Money;
}

export interface Invoice {
  id: string;
  number: string;
  subscriptionId: string;
  subscriptionNumber?: string;
  customerId: string;
  customerName?: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  status: InvoiceStatus;
  issueDate: ISODate;
  dueDate: ISODate;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  balance: Money;
  isOverdue: boolean;
  daysOverdue: number;
  sentAt: Timestamp | null;
  lines?: InvoiceLine[];
}

export interface Payment {
  id: string;
  invoiceId: string | null;
  invoiceNumber?: string;
  customerId: string | null;
  customerName?: string;
  method: PaymentMethod;
  amount: Money;
  paidOn: ISODate;
  reference: string | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: Timestamp;
}

export interface BillingRunResult {
  id: string;
  trigger: "cron" | "manual";
  runDate: ISODate;
  status: "running" | "completed" | "failed";
  created: number;
  skipped: number;
  failed: number;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
}

export interface DashboardSummary {
  activeSubscriptions: number;
  revenueCollected: Money;
  amountOutstanding: Money;
  overdueInvoices: number;
  mrr: Money;
}

export const ACTIVITY_TYPES = [
  "customer.registered",
  "customer.created",
  "quotation.created",
  "quotation.sent",
  "subscription.status_changed",
  "subscription.plan_changed",
  "invoice.generated",
  "invoice.sent",
  "invoice.cancelled",
  "payment.received",
  "reminder.sent",
  "renewal.created",
  "cancellation.requested",
  "note.added",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface CustomerActivity {
  id: string;
  customerId: string;
  type: ActivityType;
  entity: string | null;
  entityId: string | null;
  summary: string;
  actorName: string | null;
  createdAt: Timestamp;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingStatus = "open" | "reviewed" | "resolved";

export interface Finding {
  id: string;
  kind: "leakage" | "anomaly";
  rule: string;
  severity: FindingSeverity;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  amountAtRisk: Money;
  expected: Money | null;
  actual: Money | null;
  explanation: string;
  suggestion: string;
  status: FindingStatus;
  resolutionNote: string | null;
  detectedAt: Timestamp;
}

export interface Notification {
  id: string;
  channel: "email" | "in_app";
  recipient: string;
  subject: string;
  body: string;
  status: "simulated" | "sent" | "failed";
  entity: string | null;
  entityId: string | null;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}
