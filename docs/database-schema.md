# Database schema

Source of truth: [`db/schema.ts`](../db/schema.ts). Migrations: [`migrations/`](../migrations). Database: Cloudflare D1 (SQLite).

## Conventions

- Primary keys: text UUIDs from `crypto.randomUUID()` (seed rows use readable `seed-*` ids).
- **Money: `INTEGER` minor units** (paise). `2560.00` is stored as `256000`. Convert only with `shared/money.ts` (`toMinor`, `fromMinor`).
- **Percentages: `INTEGER` basis points.** 18% is `1800`.
- Calendar dates: `TEXT` `YYYY-MM-DD` (UTC). Timestamps: `TEXT` ISO 8601.
- Booleans: `INTEGER` 0/1 (Drizzle `mode: "boolean"`).
- Every foreign key has an index. Status columns used in filters are indexed.
- Emails are stored lowercased; uniqueness is enforced by a unique index.

## Changing the schema

1. Edit `db/schema.ts` in your branch.
2. Run `npm run db:generate -- --name <short_description>`. Commit the new SQL file and `migrations/meta`.
3. Run `npm run db:migrate:local` and the tests.
4. One migration per PR. Announce it in team chat before merge. **Never edit a migration already on `main`.**
5. Update this document and `shared/types.ts` if a DTO changes.

## Tables

| Table | Owner | Purpose | Key constraints and indexes |
| --- | --- | --- | --- |
| `users` | P1 | Accounts for admin, staff and customers | unique `email`; `role` index |
| `sessions` | P1 | Session tokens (SHA-256 of cookie) | FK `user_id` idx; `expires_at` |
| `password_reset_tokens` | P1 | Single-use reset tokens (hashed), 30 min | unique `token_hash`; FK idx |
| `rate_limits` | P1 | Fixed-window counters for auth endpoints | PK `key` |
| `customers` | P1 (P4 UI) | Customer profile; `user_id` set when the customer has a portal login | unique `user_id`, unique `email` |
| `settings` | P1 | JSON key/values (currency, dunning schedule, renewal reminders) | PK `key` |
| `counters` | P1 | Sequences for `SUB-000001`, `INV-000001` | PK `name` |
| `audit_log` | P1 | Who did what (status changes, billing runs, staff changes) | `(entity, entity_id)`, `actor_id`, `created_at` |
| `notifications` | P1 | Email outbox and in-app messages; `status = simulated` in demo mode | `user_id`, `(entity, entity_id)` |
| `products` | P2 | Name, type, sales/cost price, notes, active | `name`, `is_active` |
| `product_variants` | P2 | Attribute/value with extra price (Brand = Odoo, +560) | FK idx; unique `(product, attribute, value)` |
| `taxes` | P2 (P3 UI) | Percentage (bp) or fixed (per unit) tax rules | — |
| `product_taxes` | P2 | Product ↔ tax | PK `(product_id, tax_id)`; `tax_id` idx |
| `plans` | P2 | Price, billing period, min qty, availability, switches (auto_close, closable, pausable, renewable) | `status` |
| `discounts` | P2 | Fixed or percentage, thresholds, dates, usage limit/count, scope | `(starts_on, ends_on)` |
| `discount_products` | P2 | Discount ↔ product for product-scope discounts | PK; `product_id` idx |
| `quotation_templates` | P2 | Plan, validity days, payment terms | FK idx |
| `quotation_template_lines` | P2 | Product, variant, quantity | FK idx |
| `subscriptions` | P1 | Number, customer, plan, status, dates, billing anchor (`billed_periods`), `next_invoice_date`, `quote_valid_until` | unique `number`; `status`, `customer_id`, `plan_id`, `(status, next_invoice_date)`, `expiry_date` |
| `subscription_lines` | P1 | Product, variant, qty, unit price, tax, discount, amount | FK idx |
| `subscription_status_history` | P1 | Every lifecycle move with actor and time | `subscription_id` |
| `invoices` | P1 (P3 UI) | Number, subscription, customer, period, status, dates, totals, amount paid, customer snapshot | unique `number`; **unique `(subscription_id, period_start)`**; `(status, due_date)`, `customer_id`, `issue_date` |
| `invoice_lines` | P1 | Copied description/prices so old invoices never change | `invoice_id` |
| `discount_redemptions` | P1 | Discount used by an invoice; `released_at` on cancel | `discount_id`; unique `(invoice_id, discount_id)` |
| `payments` | P3 | Method, amount, date, reference, note, recorded by. `invoice_id` nullable for unmatched receipts | `invoice_id`, `customer_id`, `paid_on` |
| `billing_runs` | P1 | Trigger, run date, created/skipped/failed counts | `started_at` |
| `customer_activity` | P4 (all write) | Customer 360° timeline events | `(customer_id, created_at)` |
| `customer_notes` | P4 | Internal staff notes | `customer_id` |
| `payment_reminders` | P4 | Dunning history, one row per invoice step | unique `(invoice_id, step)` |
| `renewal_tasks` | P4 | Renewal queue per expiring subscription | unique `subscription_id`; `(status, due_on)` |
| `cancellation_requests` | P4 | Reason, offered alternative, outcome | FK idx |
| `findings` | P3 | Revenue leakage and invoice anomaly findings | unique `fingerprint`; `(kind, status, severity)` |

## Relationships

```
users 1─0..1 customers 1─* subscriptions *─1 plans
                         │        │ 1
                         │        ├─* subscription_lines *─1 products 1─* product_variants
                         │        ├─* subscription_status_history
                         │        └─* invoices 1─* invoice_lines
                         │                 ├─* payments
                         │                 ├─* discount_redemptions *─1 discounts *─* products
                         │                 └─* payment_reminders
                         ├─* customer_activity, customer_notes, cancellation_requests
quotation_templates *─1 plans;  quotation_templates 1─* quotation_template_lines
products *─* taxes (product_taxes)
```

## Status values

| Entity | Statuses |
| --- | --- |
| Subscription | `draft → quotation → confirmed → active → closed`, plus `active ↔ paused` when the plan is pausable |
| Invoice | `draft → confirmed → paid`; `draft`/`confirmed → cancelled` |
| Finding | `open → reviewed → resolved` |
| Renewal task | `open → quoted → renewed` / `cancelled` / `expired` |
| Notification | `simulated` (outbox), `sent`, `failed` |

Defined in `shared/lifecycle.ts` and enforced in the API.
