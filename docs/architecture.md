# Architecture

Brightloop is one TypeScript repository that deploys as **one Cloudflare Worker**: the worker serves the React app as static assets and the REST API under `/api/v1`, and runs the daily scheduler from a Cron Trigger. Data lives in **Cloudflare D1** (SQLite).

```
Browser (React SPA)
   │  fetch /api/v1/*  (httpOnly session cookie)
   ▼
Cloudflare Worker ── Static Assets (dist/client)         ← served before the worker runs
   │  Hono router → module routes → services
   │  Cron Trigger "0 1 * * *" → worker/jobs/scheduler.ts
   ▼
Cloudflare D1 (SQLite)   — schema in db/schema.ts, SQL migrations in migrations/
```

## Stack and reasons

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | Cloudflare Workers + Static Assets | One deploy for app and API, free plan, no cold servers |
| Database | Cloudflare D1 | Free plan (5 GB, 5M row reads/day, 100k row writes/day); real SQL with unique constraints, indexes and atomic batches |
| API | Hono 4 | Small, fast router built for Workers; typed middleware |
| ORM / migrations | Drizzle ORM + drizzle-kit | Typed queries, SQL migrations committed to Git, works with D1 batches |
| Validation | Zod 4 in `shared/schemas` | Same rules in the browser and on the server |
| Web app | React 19, Vite 8, React Router 8, TanStack Query 5, Tailwind CSS 4 | Fast builds, cached server state, design tokens as CSS variables |
| Forms | react-hook-form + zod resolver | Inline errors on blur, submit blocked until valid |
| Charts | Recharts (bundled) | Dashboard visuals without a CDN |
| Tests | Vitest 4 + `@cloudflare/vitest-plugin` | Unit tests in Node; integration tests run the real worker against a local D1 |
| Scheduler | Cloudflare Cron Trigger | Daily billing, auto-close, dunning, renewals, detection; no extra service |
| Email | Outbox table (`notifications`) | Free and offline; messages are stored and labelled "simulated" |
| AI (optional) | Groq or Gemini via `AI_API_KEY` secret | Finance Copilot only; every feature works without it |

### Deviations from the PRD stack (and why)

The PRD recommends Express + PostgreSQL + Prisma + node-cron. The team chose Cloudflare (free plan) instead:

| PRD | Brightloop | Consequence |
| --- | --- | --- |
| PostgreSQL `numeric` | D1 `INTEGER` minor units (paise) | Money stays exact; API still sends `"2560.00"` strings |
| Prisma interactive transactions | D1 `batch()` (atomic) | Each subscription's invoice, lines, discount usage and next date are written in one batch |
| bcrypt | PBKDF2-SHA256 (100k iterations, Web Crypto) | Pure-JS bcrypt exceeds the Workers free-plan CPU budget; hashes store their iteration count |
| node-cron | Cron Trigger | Same daily schedule; `POST /billing/run` for manual runs |
| Mailpit | `notifications` outbox + console | Reset links and invoices are visible in the outbox and `wrangler` logs |
| Docker Compose | `wrangler` / Miniflare local mode | `npm run dev` runs app, API and a local D1 file offline |
| OpenAPI at `/docs` | `docs/api-contracts.md` | Can be generated later with `@hono/zod-openapi` |

## Free-plan guardrails

- **CPU (10 ms per request):** no heavy JS crypto; PBKDF2 runs natively. Billing work per subscription is small; the billing run processes subscriptions in pages.
- **D1 reads (5M/day):** every list is paginated (25 rows default, 100 max); dashboard figures come from `COUNT`/`SUM` on indexed columns. Cache dashboard aggregates in a `settings` row or the Cache API if load grows.
- **D1 writes (100k/day):** the bulk load-test seed runs **locally only**. Rate limiting writes one row per key and is used on auth endpoints only.
- **Cron triggers (5 per account):** one trigger; modules register jobs in `worker/jobs/scheduler.ts`.
- **Requests (100k/day):** polling intervals on dashboards stay at 60 s or more.

## Request flow

1. `worker/index.ts` creates the Drizzle client and loads the session (`worker/lib/auth.ts`).
2. Module routers validate input with shared zod schemas (`worker/lib/validate.ts`).
3. Guards (`requirePermission`) check `shared/permissions.ts`. Customer endpoints filter by `ownCustomerId(c)` only.
4. Services do the work; state changes go through explicit action endpoints (`POST /subscriptions/:id/transition`), never a free `PATCH` of `status`.
5. Errors are thrown as `ApiError` and returned as `{ error: { code, message, fields } }`.

## Billing correctness ("nothing twice, nothing skipped")

- Unique index `invoices (subscription_id, period_start)` makes a duplicate invoice impossible, even with two overlapping runs.
- Periods are computed from the subscription anchor: `periodStart(start_date, period, n)`, with month-end clamping and no drift (`shared/dates.ts`).
- The run loops while `next_invoice_date <= today`, so missed days are caught up.
- Each subscription is billed in one `db.batch([...])`: invoice, lines, discount redemption, usage count and the new `billed_periods`/`next_invoice_date`. A unique-constraint failure means the period already exists: count it as skipped, not failed.
- Prices, discounts and taxes come only from `shared/pricing.ts`.

## Repository layout

```
brightloop/
├─ db/schema.ts             Drizzle schema (single source of truth for tables)
├─ migrations/              SQL migrations generated by drizzle-kit, applied by wrangler
├─ shared/                  Code used by browser AND worker — no runtime-specific imports
│  ├─ money.ts dates.ts     Money (minor units) and date helpers
│  ├─ pricing.ts            Pricing, discount, tax and MRR engine (pure functions)
│  ├─ lifecycle.ts          Subscription and invoice state machines
│  ├─ permissions.ts        Role → capability matrix
│  ├─ api.ts types.ts       API conventions and response DTOs
│  └─ schemas/              Zod input schemas
├─ worker/                  Cloudflare Worker (API + cron)
│  ├─ index.ts              App, middleware, module mounting, scheduled()
│  ├─ lib/                  db, auth, errors, validate, pagination, events, notifications, counters
│  ├─ jobs/scheduler.ts     Job registry for the daily cron
│  └─ modules/<module>/     routes.ts (+ service.ts) per module
├─ src/                     React app
│  ├─ app/                  router.tsx, navigation.ts
│  ├─ components/ui/        Design system (Button, Field, DataTable, Dialog, Toast …)
│  ├─ components/layout/    App shell (sidebar, top bar, auth layout)
│  ├─ lib/                  api client, auth hooks, forms, formatting
│  └─ modules/<module>/     Pages per module
├─ scripts/                 seed.ts, reset-local.ts
├─ tests/unit, tests/integration
└─ docs/
```
