# Team ownership

All modules are implemented. Each person owns the folders below: they explain, maintain, test and present that code. Shared files need a second reviewer (see `.github/CODEOWNERS`). Replace "Person N" with real names.

## Person 1 — Tech lead: core backend, architecture & AI

Branch: `feature/core-backend`

| Area | Folders / files |
| --- | --- |
| Shared foundation | `db/`, `migrations/`, `shared/` (all), `worker/index.ts`, `worker/env.ts`, `worker/lib/`, `worker/jobs/` |
| API modules | `worker/modules/auth/`, `worker/modules/staff/`, `worker/modules/system/`, `worker/modules/subscriptions/`, `worker/modules/billing/`, `worker/modules/ai/` |
| Web app foundation | `src/main.tsx`, `src/styles.css`, `src/app/`, `src/components/` (ui, layout, shared), `src/lib/` |
| Pages | `src/modules/auth/`, `src/modules/staff/` (staff + roles/profile), `src/modules/subscriptions/`, `src/modules/billing/`, `src/modules/copilot/` |
| Tests & tooling | `tests/integration/helpers.ts`, `tests/integration/apply-migrations.ts`, `tests/integration/auth.test.ts`, `tests/integration/billing.test.ts`, `tests/unit/pricing.test.ts`, `scripts/seed.ts`, `scripts/reset-local.ts`, config files (`package.json`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `drizzle.config.ts`), `.github/` |
| Requirements | AUTH-1–4, SUB-1–3, INV-1, INV-2, INV-4, DISC-3, PLAN auto-close, SYS-1 (base seed), SYS-3, AI Finance Copilot |

## Person 2 — Products, plans & sales

Branch: `feature/products-plans`

| Area | Folders |
| --- | --- |
| API modules | `worker/modules/products/` (products + variants), `worker/modules/plans/`, `worker/modules/taxes/`, `worker/modules/discounts/`, `worker/modules/quotations/` (templates + start quotation) |
| Pages | `src/modules/products/` (products, variants), `src/modules/plans/`, `src/modules/taxes/`, `src/modules/discounts/`, `src/modules/quotations/` (quotations, templates) |
| Co-owns | `shared/pricing.ts`, `shared/schemas/catalog.ts` (with Person 1) |
| Requirements | CAT-1, CAT-2, PLAN-1, PLAN-2, TAX-1, DISC-1, DISC-2, QT-1 |

## Person 3 — Finance, invoices & payments

Branch: `feature/finance-payments`

| Area | Folders |
| --- | --- |
| API modules | `worker/modules/invoices/`, `worker/modules/payments/`, `worker/modules/reports/`, `worker/modules/finance/` (revenue leakage + invoice anomalies) |
| Pages | `src/modules/invoices/`, `src/modules/payments/` (payments, outstanding invoices), `src/modules/reports/` (dashboard, reports, charts), `src/modules/finance/` (leakage + anomalies) |
| Requirements | INV-3, PAY-1, PAY-2, REP-1–3, SYS-2 (dashboard polling), Revenue Leakage Detector, Invoice Anomaly Detection |

## Person 4 — Customer experience & intelligence

Branch: `feature/customer-intelligence`

| Area | Folders / files |
| --- | --- |
| API modules | `worker/modules/customers/` (directory, 360°, timeline, notes, health score), `worker/modules/portal/`, `worker/modules/dunning/`, `worker/modules/renewals/`, `worker/modules/retention/`, `worker/modules/simulator/`, `worker/modules/demo/` |
| Pages | `src/modules/customers/`, `src/modules/customer-health/`, `src/modules/customer-portal/`, `src/modules/dunning/`, `src/modules/renewals/`, `src/modules/retention/`, `src/modules/simulator/` |
| Tests & data | `tests/unit/intelligence.test.ts`, `scripts/seed-bulk.ts` |
| Requirements | PORT-1, PORT-2, SYS-1 (bulk + demo scenario), Customer 360° Timeline, Health Score, Smart Dunning, Renewal Management, Cancellation & Retention, What-if Simulator |

## Cross-module dependencies (who calls whom)

| Caller | Calls | Why |
| --- | --- | --- |
| P2 `quotations` | P1 `subscriptions/service.createSubscription` | Quotations are subscriptions in status `quotation` |
| P3 `invoices` | P1 `billing/service` (confirm, cancel, send, edit, detail) | P1 owns authoritative invoice maths |
| P4 `portal`, `renewals`, `retention`, `demo` | P1 `subscriptions/service` | Lifecycle rules live in one place |
| P4 `portal` | P3 `invoices/routes.invoiceWhere`, P1 `billing/service.getInvoiceDetail` | Same filters and invoice view for customers |
| P4 `demo` | P1 billing, P3 payments + detection, P4 services | Demo replays real code paths |
| P1 `ai` | P4 `customers/health.computeHealth` | "Customers at risk" answers |
| P1 `jobs/scheduler` | P3 detection, P4 dunning + renewals | One cron trigger runs every job |

Every page imports UI only from `src/components/*` and data helpers from `src/lib/*` (Person 1). The only page-to-page import is inside one owner's area (P3 `payments` reuses P3 `invoices` dialogs; P4 `customers` reuses P4 `customer-health` meter).

## Review pairs

1 ↔ 2 and 3 ↔ 4; the other pair is backup. Person 2 reviews Person 1's billing code.
