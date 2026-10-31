# Team ownership

Four vertical slices: each person owns the API routes, services, pages and tests for their modules. Shared files need a second reviewer (see `.github/CODEOWNERS`). Replace "Person N" with real names.

| | Person 1 — Tech lead: core backend & AI | Person 2 — Products, plans & sales | Person 3 — Finance, invoices & payments | Person 4 — Customer experience & intelligence |
| --- | --- | --- | --- | --- |
| Branch | `feature/core-backend` | `feature/products-plans` | `feature/finance-payments` | `feature/customer-intelligence` |
| Requirement IDs | AUTH-1–4, SUB-1–3, INV-1, INV-2, INV-4, DISC-3, PLAN auto-close, SYS-1 (base), SYS-3 | CAT-1, CAT-2, PLAN-1–3, TAX-1 (API), DISC-1, DISC-2, QT-1 | INV-3, PAY-1, PAY-2, REP-1–3, TAX-1 (UI), leakage, anomalies | PORT-1, PORT-2, customers, timeline, health score, dunning, renewals, retention, simulator, SYS-1 (bulk), SYS-2 |
| Worker folders | `worker/lib`, `worker/jobs`, `worker/modules/{auth,staff,system,subscriptions,billing,ai}` | `worker/modules/{products,plans,taxes,discounts,quotations}` | `worker/modules/{invoices,payments,reports,finance}` | `worker/modules/{customers,portal,dunning,renewals,retention,simulator}` |
| Web folders | `src/app`, `src/components`, `src/lib`, `src/modules/{auth,staff,subscriptions,billing,copilot}` | `src/modules/{products,plans,taxes,discounts,quotations}` | `src/modules/{invoices,payments,reports,finance}` | `src/modules/{customers,customer-portal,customer-health,dunning,renewals,retention,simulator}` |
| Shared | `db/schema.ts`, `migrations/`, `shared/*` (coordinator) | `shared/pricing.ts` co-owner | — | — |
| Scheduler jobs | billing-run, plan-auto-close, activate-confirmed, cleanup | — | revenue-leakage, invoice-anomalies | dunning, renewals |

## Foundation already on `main` (Person 1)

- Schema for every module (all 32 tables) and the initial migration.
- Shared contracts: money, dates, pricing/discount/tax/MRR engine, lifecycles, permissions, zod schemas, DTO types, API conventions.
- Worker core: Hono app, sessions, guards, errors, validation, pagination, rate limiting, audit/activity writers, email outbox, number counters, scheduler registry.
- Auth (signup, login, logout, me, forgot/reset password) and staff management, with integration tests.
- Design system, app shell, role-based navigation, auth screens, staff screen, placeholder routes for every module.
- Base seed: admin, staff, customer, products with variants, taxes, plans, discounts, a template, settings.

## Hand-offs

| From → To | What | When |
| --- | --- | --- |
| P1 → all | Foundation (this commit) | Done |
| P2 → P1 | Products, plans, taxes, discounts in the database and API | Middle of phase 2 |
| P1 → P3 | Billing run filling `invoices`; `confirmInvoice` / `cancelInvoice` services | Start of phase 3 |
| P1 → P4 | `transitionSubscription`, `createSubscription` (for renewals and portal actions) | Middle of phase 2 |
| P3 → P4 | Invoice balances and overdue data for dunning and health | Phase 3 |
| P4 → P1, P3 | Bulk seed (10k subscriptions, 30k invoices) for load tests | Phase 3 |

Until an upstream slice lands, work against the agreed schema and seed rows in the local database, not static JSON.

## Review pairs

1 ↔ 2 and 3 ↔ 4; the other pair is backup. Person 2 reviews Person 1's billing code.
