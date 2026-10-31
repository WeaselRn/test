# API and service contracts

Base path: `/api/v1`. All endpoints below are implemented. Critical paths (auth, roles, billing idempotency, pricing, payments, discount release, lifecycle rules, portal isolation) have integration tests in `tests/integration/`.

## Conventions

- **Lists:** `?page=1&pageSize=25&sort=-createdAt&q=text&<filters>` → `{ data, page, pageSize, total }`. `pageSize` max 100. Parse with `listQuerySchema` (`shared/api.ts`); sort keys are allow-listed per endpoint (`worker/lib/pagination.ts#orderBy`).
- **Errors:** `{ error: { code, message, fields? } }`. Codes: `bad_request 400`, `unauthenticated 401`, `forbidden 403`, `not_found 404`, `conflict 409`, `invalid_transition 409`, `validation_failed 422`, `rate_limited 429`, `internal 500`.
- **Money:** strings with 2 decimals (`"2560.00"`). Percentages: strings (`"18.00"`). Dates: `YYYY-MM-DD`; timestamps ISO 8601.
- **State changes:** explicit action endpoints (`/confirm`, `/transition`), never `PATCH { status }`.
- **Single object responses:** `{ data: T }`. Auth responses: `{ user }`.
- **Auth:** httpOnly `bl_session` cookie. Guards: `requirePermission("<permission>")` from `shared/permissions.ts`.
- **Customer data:** portal routes read the customer id from the session (`ownCustomerId(c)`), never from the URL.

## Endpoints

| Module (owner) | Method & path | Permission | Status |
| --- | --- | --- | --- |
| Auth (P1) | `POST /auth/signup` `{name,email,password,companyName?}` → `{user}` 201 | public, rate-limited | Implemented |
| | `POST /auth/login` `{email,password}` → `{user}` | public, rate-limited | Implemented |
| | `POST /auth/logout` → 204 | any | Implemented |
| | `GET /auth/me` → `{user: SessionUser}` | signed in | Implemented |
| | `POST /auth/forgot-password` `{email}` → `{message}` (same for unknown emails) | public, rate-limited | Implemented |
| | `POST /auth/reset-password` `{token,password}` → `{message}` | public, rate-limited | Implemented |
| Staff (P1) | `GET /staff` · `POST /staff` · `PATCH /staff/:id` `{name?,isActive?,role?}` | `staff:manage` | Implemented |
| System (P1) | `GET /health` · `GET /notifications` · `GET /outbox` | public · signed in · `customer:read` | Implemented |
| Customers (P4, model P1) | `GET/POST /customers`, `GET/PATCH /customers/:id`, `GET /customers/:id/timeline`, `POST /customers/:id/notes`, `GET /customers/:id/health` | `customer:read` / `customer:write` | Implemented |
| Products (P2) | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `POST /products/:id/variants`, `PATCH/DELETE /variants/:id` | `catalog:read` / `catalog:write` | Implemented |
| Plans (P2) | `GET/POST /plans`, `GET/PATCH /plans/:id`, `POST /plans/:id/close` | `catalog:read` / `catalog:write` | Implemented |
| Taxes (P2 API, P3 UI) | `GET/POST /taxes`, `PATCH/DELETE /taxes/:id` | `tax:read` / `tax:write` | Implemented |
| Discounts (P2) | `GET/POST /discounts`, `GET/PATCH/DELETE /discounts/:id` | `discount:read` / `discount:write` | Implemented |
| Templates (P2) | `GET/POST /quotation-templates`, `GET/PATCH/DELETE /quotation-templates/:id` | `template:read` / `template:write` | Implemented |
| Quotations (P2) | `POST /subscriptions/from-template/:templateId` `{customerId,startDate}` → `{data: Subscription}` (status `quotation`) | `subscription:write` | Implemented |
| Subscriptions (P1) | `GET /subscriptions?status&customerId&planId&from&to&q`, `POST /subscriptions`, `GET/PATCH /subscriptions/:id` (draft only), `POST /subscriptions/:id/transition` `{to,note?}`, `GET /subscriptions/:id/history` | `subscription:read` / `subscription:write` | Implemented |
| Billing (P1) | `POST /billing/run` → `BillingRunResult`, `GET /billing/runs` | `billing:run` | Implemented |
| Invoices (P1 service, P3 UI) | `GET /invoices?status&customerId&overdue&from&to`, `GET /invoices/:id`, `PATCH /invoices/:id` (draft only), `POST /invoices/:id/confirm`, `/cancel`, `/send`, `GET /invoices/:id/print` | `invoice:read` / `invoice:write` | Implemented |
| Payments (P3) | `POST /invoices/:id/payments` `PaymentInput`, `GET /payments?invoiceId&customerId&from&to&method`, `POST /payments` (unmatched receipt) | `payment:read` / `payment:write` | Implemented |
| Reports (P3) | `GET /reports/summary` → `DashboardSummary`, `/reports/revenue?from&to&groupBy`, `/reports/overdue`, `/reports/mrr`, `/reports/:name.csv` | `report:read` | Implemented |
| Findings (P3) | `GET /findings?kind&status&severity`, `PATCH /findings/:id` `{status,resolutionNote}`, `POST /findings/scan` | `finding:read` / `finding:write` | Implemented |
| Dunning (P4) | `GET/PUT /dunning/schedule`, `GET /dunning/reminders?invoiceId` | `invoice:read` / `settings:write` | Implemented |
| Renewals (P4) | `GET /renewals?window=7|30&status`, `POST /renewals/:id/quote` → renewal quotation, `PATCH /renewals/:id` `{status,note}` | `subscription:read` / `subscription:write` | Implemented |
| Simulator (P4) | `GET /simulator/baseline` (aggregates only; simulation runs in the browser with `shared/pricing.ts`) | `report:read` | Implemented |
| Portal (P4) | `GET /portal/summary`, `/portal/subscriptions`, `/portal/invoices`, `/portal/invoices/:id`, `/portal/payments`, `POST /portal/subscriptions/:id/pause` `/renew` `/close`, `POST /portal/subscriptions/:id/cancellation-request` | `portal:access` | Implemented |
| Billing extras (P1) | `GET /billing/config` → `{ demoMode }`; `POST /billing/run { asOf }` bills as of another date in demo mode | `billing:run` | Implemented |
| Catalog extras (P2) | `GET /products/variants` (flat list with final prices), `POST /plans/:id/reopen` | `catalog:read` / `catalog:write` | Implemented |
| Finance extras (P3) | `POST /invoices/confirm-drafts { ids }`, `POST /payments/:id/match { invoiceId }`, `GET /findings/summary?kind` | `invoice:write`, `payment:write`, `finding:read` | Implemented |
| Customer extras (P4) | `GET /customers/health?category`, `GET /customers/:id/notes`, `GET /dunning/stats`, `POST /dunning/run`, `GET /renewals/summary`, `POST /renewals/scan`, `GET /retention/stats`, `POST /portal/subscriptions/:id/accept` `/resume`, `POST /portal/cancellation-requests/:id/resolve { decision }`, `GET/PATCH /portal/profile` | as module | Implemented |
| Demo (P4) | `POST /demo/load` — six-month demo scenario through real services; empty database and `DEMO_MODE=true` only | admin | Implemented |
| AI copilot (P1) | `GET /ai/status`, `POST /ai/ask` `{question}` → `{text, source, figures, rows}` | `ai:use`, throttled | Implemented |

## Cross-module service contracts (worker)

Modules call each other through these functions only. Each takes the Drizzle `db` (and `env` where needed) as the first argument and throws `ApiError` on rule violations.

```ts
// worker/modules/subscriptions/service.ts — Person 1
createSubscription(db, input: SubscriptionInput & { status?: "draft" | "quotation"; templateId?: string; quoteValidUntil?: string; renewedFromId?: string }, actorId: string): Promise<Subscription>
transitionSubscription(db, id: string, to: SubscriptionStatus, actorId: string | null, note?: string): Promise<Subscription>
getSubscription(db, id: string): Promise<Subscription & { lines: SubscriptionLine[] }>

// worker/modules/billing/service.ts — Person 1
runBilling(db, env, opts: { today: ISODate; trigger: "cron" | "manual"; actorId?: string }): Promise<BillingRunResult>
generateInvoiceForPeriod(db, subscriptionId: string, periodIndex: number, today: ISODate, runId: string): Promise<"created" | "skipped">
confirmInvoice(db, env, invoiceId: string, actorId: string): Promise<Invoice>
cancelInvoice(db, invoiceId: string, actorId: string): Promise<Invoice>   // releases discount usage

// worker/modules/payments/service.ts — Person 3
recordPayment(db, invoiceId: string, input: PaymentInput, actorId: string): Promise<Payment>   // rejects draft/cancelled, caps at balance, marks Paid
getOutstandingBalance(db, invoiceId: string): Promise<Minor>

// worker/modules/finance/detection.ts — Person 3 (registered as scheduler jobs)
scanRevenueLeakage(ctx: JobContext): Promise<{ created: number }>
scanInvoiceAnomalies(ctx: JobContext): Promise<{ created: number }>

// worker/modules/customers/service.ts — Person 4
getCustomerProfile(db, id: string): Promise<Customer & { stats }>
computeHealthScore(db, customerId: string, today: ISODate): Promise<{ score: number; category: "healthy" | "needs_attention" | "at_risk"; reasons: { signal: string; penalty: number }[] }>

// worker/modules/dunning/service.ts — Person 4 (scheduler job; sends through lib/notifications)
runDunning(ctx: JobContext): Promise<{ sent: number }>
// worker/modules/renewals/service.ts — Person 4
scanRenewals(ctx: JobContext): Promise<{ created: number }>

// worker/lib — Person 1 (shared helpers, already implemented)
sendEmail(db, env, { to, subject, body, userId?, entity?, entityId? }): Promise<string>
auditEntry(db, {...}) / activityEntry(db, {...})   // return insert builders for db.batch([...])
nextNumber(env.DB, "subscription" | "invoice", prefix): Promise<string>
```

## Shared pure functions (`shared/`)

```ts
priceInvoice(lines: PricingLineInput[], discounts: DiscountRule[], on: ISODate): PricedInvoice
unitPrice(salesPrice, variantExtraPrice): Minor
monthlyNormalised(amount, period): Minor
periodStart(anchor, period, n) / periodEnd(anchor, period, n) / addMonths / addDays / diffDays
canTransitionSubscription(from, to, planSwitches, { today, quoteValidUntil }): { ok } | { ok: false, reason }
canTransitionInvoice(from, to) / isInvoiceOverdue(invoice, today)
can(role, permission)
toMinor / fromMinor / formatMoney
```

## Scheduler jobs (order in `worker/jobs/scheduler.ts`)

1. `billing-run` (P1) 2. `plan-auto-close` (P1) 3. `activate-confirmed` (P1) 4. `dunning` (P4) 5. `renewals` (P4) 6. `revenue-leakage` (P3) 7. `invoice-anomalies` (P3) 8. `cleanup-expired-sessions` (P1, implemented)

Every job is idempotent: unique constraints (`invoices (subscription_id, period_start)`, `payment_reminders (invoice_id, step)`, `renewal_tasks (subscription_id)`, `findings (fingerprint)`) make re-runs safe.
