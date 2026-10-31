/**
 * Brightloop database schema (Cloudflare D1 / SQLite).
 *
 * Conventions
 * - Primary keys are text UUIDs generated in the worker (crypto.randomUUID()).
 * - Money is stored as INTEGER minor units (paise/cents). Never floats.
 * - Percentages are stored as INTEGER basis points (18% = 1800).
 * - Dates are ISO strings: `YYYY-MM-DD` for calendar dates, full ISO for timestamps.
 * - Every foreign key is indexed.
 *
 * Ownership of each table is documented in docs/database-schema.md.
 * Change this file only through a reviewed PR; then run `npm run db:generate`.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const bool = (name: string) => integer(name, { mode: "boolean" });

/* ───────────────────────────── Platform & access (Person 1) ───────────────────────────── */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(), // stored lowercased
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "staff", "customer"] }).notNull(),
    isActive: bool("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_role_idx").on(t.role)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 of the cookie token
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_uq").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

export const customers = sqliteTable(
  "customers",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    companyName: text("company_name"),
    contactName: text("contact_name").notNull(),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    taxId: text("tax_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_user_uq").on(t.userId),
    uniqueIndex("customers_email_uq").on(t.email),
    index("customers_contact_idx").on(t.contactName),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});

/** Monotonic counters for human-readable numbers (SUB-000123, INV-000456). */
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: text("meta", { mode: "json" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

/** Outbox for every email/in-app message. In `outbox` mode messages are simulated, never sent. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    channel: text("channel", { enum: ["email", "in_app"] }).notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["simulated", "sent", "failed"] }).notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_entity_idx").on(t.entity, t.entityId),
  ],
);

/* ───────────────────────────── Catalog & pricing (Person 2) ───────────────────────────── */

export const products = sqliteTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type", { enum: ["service", "goods", "software"] }).notNull(),
    salesPrice: integer("sales_price").notNull(),
    costPrice: integer("cost_price").notNull().default(0),
    notes: text("notes"),
    isActive: bool("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_name_idx").on(t.name), index("products_active_idx").on(t.isActive)],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(), // e.g. "Brand"
    value: text("value").notNull(), // e.g. "Odoo"
    extraPrice: integer("extra_price").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_uq").on(t.productId, t.attribute, t.value),
  ],
);

export const taxes = sqliteTable("taxes", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["percentage", "fixed"] }).notNull(),
  /** Basis points for `percentage`, minor units per unit for `fixed`. */
  rate: integer("rate").notNull(),
  isActive: bool("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const productTaxes = sqliteTable(
  "product_taxes",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => taxes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.taxId] }), index("product_taxes_tax_idx").on(t.taxId)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: id(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    billingPeriod: text("billing_period", { enum: ["daily", "weekly", "monthly", "yearly"] }).notNull(),
    minQuantity: integer("min_quantity").notNull().default(1),
    availableFrom: text("available_from").notNull(),
    availableTo: text("available_to"),
    autoClose: bool("auto_close").notNull().default(false),
    closable: bool("closable").notNull().default(true),
    pausable: bool("pausable").notNull().default(false),
    renewable: bool("renewable").notNull().default(true),
    status: text("status", { enum: ["active", "closed"] }).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plans_status_idx").on(t.status)],
);

export const discounts = sqliteTable(
  "discounts",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["fixed", "percentage"] }).notNull(),
    /** Basis points for `percentage`, minor units for `fixed`. */
    value: integer("value").notNull(),
    minPurchase: integer("min_purchase").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    usageLimit: integer("usage_limit"), // null = unlimited
    usageCount: integer("usage_count").notNull().default(0),
    scope: text("scope", { enum: ["product", "subscription"] }).notNull(),
    isActive: bool("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("discounts_dates_idx").on(t.startsOn, t.endsOn)],
);

export const discountProducts = sqliteTable(
  "discount_products",
  {
    discountId: text("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.discountId, t.productId] }),
    index("discount_products_product_idx").on(t.productId),
  ],
);

export const quotationTemplates = sqliteTable(
  "quotation_templates",
  {
    id: id(),
    name: text("name").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    validityDays: integer("validity_days").notNull().default(30),
    paymentTermDays: integer("payment_term_days").notNull().default(15),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quotation_templates_plan_idx").on(t.planId), index("quotation_templates_creator_idx").on(t.createdBy)],
);

export const quotationTemplateLines = sqliteTable(
  "quotation_template_lines",
  {
    id: id(),
    templateId: text("template_id")
      .notNull()
      .references(() => quotationTemplates.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [
    index("qt_lines_template_idx").on(t.templateId),
    index("qt_lines_product_idx").on(t.productId),
    index("qt_lines_variant_idx").on(t.variantId),
  ],
);

/* ───────────────────────────── Subscriptions & billing (Person 1) ───────────────────────────── */

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: id(),
    number: text("number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    templateId: text("template_id").references(() => quotationTemplates.id, { onDelete: "set null" }),
    /** Set when this subscription is a renewal quotation of an earlier one. */
    renewedFromId: text("renewed_from_id"),
    status: text("status", {
      enum: ["draft", "quotation", "confirmed", "active", "paused", "closed"],
    }).notNull(),
    startDate: text("start_date").notNull(),
    expiryDate: text("expiry_date"),
    /** Billing anchor: periods are computed from start_date + n periods to avoid month-end drift. */
    billedPeriods: integer("billed_periods").notNull().default(0),
    nextInvoiceDate: text("next_invoice_date"),
    paymentTermDays: integer("payment_term_days").notNull().default(15),
    quoteValidUntil: text("quote_valid_until"),
    closedReason: text("closed_reason"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscriptions_number_uq").on(t.number),
    index("subscriptions_status_idx").on(t.status),
    index("subscriptions_customer_idx").on(t.customerId),
    index("subscriptions_plan_idx").on(t.planId),
    index("subscriptions_template_idx").on(t.templateId),
    index("subscriptions_renewed_from_idx").on(t.renewedFromId),
    index("subscriptions_next_invoice_idx").on(t.status, t.nextInvoiceDate),
    index("subscriptions_expiry_idx").on(t.expiryDate),
  ],
);

export const subscriptionLines = sqliteTable(
  "subscription_lines",
  {
    id: id(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    taxId: text("tax_id").references(() => taxes.id, { onDelete: "set null" }),
    discountId: text("discount_id").references(() => discounts.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
  },
  (t) => [
    index("subscription_lines_sub_idx").on(t.subscriptionId),
    index("subscription_lines_product_idx").on(t.productId),
    index("subscription_lines_variant_idx").on(t.variantId),
    index("subscription_lines_tax_idx").on(t.taxId),
    index("subscription_lines_discount_idx").on(t.discountId),
  ],
);

export const subscriptionStatusHistory = sqliteTable(
  "subscription_status_history",
  {
    id: id(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("sub_history_sub_idx").on(t.subscriptionId), index("sub_history_actor_idx").on(t.actorId)],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    number: text("number").notNull(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    status: text("status", { enum: ["draft", "confirmed", "paid", "cancelled"] }).notNull(),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    subtotal: integer("subtotal").notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    taxTotal: integer("tax_total").notNull().default(0),
    total: integer("total").notNull(),
    amountPaid: integer("amount_paid").notNull().default(0),
    /** Snapshot of customer billing details at issue time. */
    customerSnapshot: text("customer_snapshot", { mode: "json" }),
    billingRunId: text("billing_run_id"),
    sentAt: text("sent_at"),
    confirmedAt: text("confirmed_at"),
    paidAt: text("paid_at"),
    cancelledAt: text("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.number),
    // "Nothing billed twice": one invoice per subscription billing period.
    uniqueIndex("invoices_sub_period_uq").on(t.subscriptionId, t.periodStart),
    index("invoices_status_due_idx").on(t.status, t.dueDate),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_issue_idx").on(t.issueDate),
    index("invoices_billing_run_idx").on(t.billingRunId),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    // Values are copied so old invoices never change when catalog data changes.
    description: text("description").notNull(),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    discountAmount: integer("discount_amount").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    amount: integer("amount").notNull(), // after discount, including tax
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId), index("invoice_lines_product_idx").on(t.productId)],
);

export const discountRedemptions = sqliteTable(
  "discount_redemptions",
  {
    id: id(),
    discountId: text("discount_id")
      .notNull()
      .references(() => discounts.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    releasedAt: text("released_at"), // set when the invoice is cancelled
    createdAt: createdAt(),
  },
  (t) => [
    index("discount_redemptions_discount_idx").on(t.discountId),
    uniqueIndex("discount_redemptions_invoice_uq").on(t.invoiceId, t.discountId),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    /** Nullable so unmatched receipts can be recorded and surfaced by leakage detection. */
    invoiceId: text("invoice_id").references(() => invoices.id),
    customerId: text("customer_id").references(() => customers.id),
    method: text("method", { enum: ["bank_transfer", "cash", "upi", "card", "other"] }).notNull(),
    amount: integer("amount").notNull(),
    paidOn: text("paid_on").notNull(),
    reference: text("reference"),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_customer_idx").on(t.customerId),
    index("payments_paid_on_idx").on(t.paidOn),
    index("payments_recorded_by_idx").on(t.recordedBy),
  ],
);

export const billingRuns = sqliteTable(
  "billing_runs",
  {
    id: id(),
    trigger: text("trigger", { enum: ["cron", "manual"] }).notNull(),
    runDate: text("run_date").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
    created: integer("created").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    details: text("details", { mode: "json" }),
    startedAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("billing_runs_started_idx").on(t.startedAt), index("billing_runs_actor_idx").on(t.actorId)],
);

/* ───────────────────────────── Customer intelligence (Person 4) ───────────────────────────── */

/** Customer 360° timeline. Every module appends events through lib/activity. */
export const customerActivity = sqliteTable(
  "customer_activity",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // see shared/types ActivityType
    entity: text("entity"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("customer_activity_customer_idx").on(t.customerId, t.createdAt),
    index("customer_activity_actor_idx").on(t.actorId),
  ],
);

export const customerNotes = sqliteTable(
  "customer_notes",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("customer_notes_customer_idx").on(t.customerId), index("customer_notes_author_idx").on(t.authorId)],
);

/** Dunning reminder history. One row per (invoice, step) so a step is never sent twice. */
export const paymentReminders = sqliteTable(
  "payment_reminders",
  {
    id: id(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    step: text("step").notNull(), // e.g. "pre_due", "overdue_3", "overdue_7", "escalate_14"
    notificationId: text("notification_id").references(() => notifications.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payment_reminders_invoice_step_uq").on(t.invoiceId, t.step),
    index("payment_reminders_notification_idx").on(t.notificationId),
  ],
);

export const renewalTasks = sqliteTable(
  "renewal_tasks",
  {
    id: id(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    dueOn: text("due_on").notNull(),
    status: text("status", { enum: ["open", "quoted", "renewed", "cancelled", "expired"] })
      .notNull()
      .default("open"),
    renewalSubscriptionId: text("renewal_subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("renewal_tasks_sub_uq").on(t.subscriptionId),
    index("renewal_tasks_status_due_idx").on(t.status, t.dueOn),
    index("renewal_tasks_renewal_idx").on(t.renewalSubscriptionId),
    index("renewal_tasks_assignee_idx").on(t.assigneeId),
  ],
);

export const cancellationRequests = sqliteTable(
  "cancellation_requests",
  {
    id: id(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    reason: text("reason", {
      enum: ["too_expensive", "temporary", "missing_features", "not_using", "other"],
    }).notNull(),
    comment: text("comment"),
    offeredAlternative: text("offered_alternative"), // e.g. "pause", "downgrade:<planId>"
    outcome: text("outcome", { enum: ["pending", "accepted_alternative", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    index("cancellation_requests_sub_idx").on(t.subscriptionId),
    index("cancellation_requests_customer_idx").on(t.customerId),
  ],
);

/* ───────────────────────────── Detection (Person 3) ───────────────────────────── */

/** Revenue leakage and invoice anomaly findings share one table, split by `kind`. */
export const findings = sqliteTable(
  "findings",
  {
    id: id(),
    kind: text("kind", { enum: ["leakage", "anomaly"] }).notNull(),
    rule: text("rule").notNull(),
    severity: text("severity", { enum: ["critical", "high", "medium", "low"] }).notNull(),
    /** Stable hash of rule + subject ids, so a re-scan never duplicates a finding. */
    fingerprint: text("fingerprint").notNull(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    paymentId: text("payment_id").references(() => payments.id, { onDelete: "cascade" }),
    amountAtRisk: integer("amount_at_risk").notNull().default(0),
    expected: integer("expected"),
    actual: integer("actual"),
    explanation: text("explanation").notNull(),
    suggestion: text("suggestion").notNull(),
    status: text("status", { enum: ["open", "reviewed", "resolved"] }).notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    detectedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("findings_fingerprint_uq").on(t.fingerprint),
    index("findings_kind_status_idx").on(t.kind, t.status, t.severity),
    index("findings_customer_idx").on(t.customerId),
    index("findings_subscription_idx").on(t.subscriptionId),
    index("findings_invoice_idx").on(t.invoiceId),
    index("findings_payment_idx").on(t.paymentId),
    index("findings_resolved_by_idx").on(t.resolvedBy),
  ],
);
