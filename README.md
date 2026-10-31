# Brightloop

Subscription management for a recurring-revenue business: products, plans, quotations, subscriptions, recurring invoices, payments and finance reporting, plus revenue-leakage detection, dunning, renewals, customer health and a what-if simulator.

Runs on **Cloudflare Workers + D1** (free plan). Everything also runs offline on a laptop.

## Quick start

Requirements: Node.js 22+ (24 recommended). No Docker and no Cloudflare account needed for local work.

```bash
npm run setup     # install, create the local D1 database, apply migrations, seed demo data
npm run dev       # http://localhost:5173 (app + API + local database)
```

Demo accounts (local seed only, defined in `scripts/seed.ts`):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@brightloop.test` | `Brightloop!admin1` |
| Staff | `staff@brightloop.test` | `Brightloop!staff1` |
| Customer | `customer@brightloop.test` | `Brightloop!cust1` |

**Load the demo scenario:** sign in as admin → *Billing runs* → **Load six-month demo scenario**. It replays six months of billing through the real services: overdue invoices, a late payer, an unmatched payment, an unbilled period, an expired discount still applied, expiring subscriptions and a price-driven cancellation request. Demo customers are labelled "(demo)". To start over: `npm run db:reset:local`.

Emails (password reset, invoices, reminders) are **simulated**: they are stored in the `notifications` outbox and printed in the dev-server console. Nothing is delivered.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + Worker dev server with a local D1 database |
| `npm run typecheck` | TypeScript across app, worker and scripts |
| `npm test` | Unit tests (Node) and integration tests (real worker + D1 in Miniflare) |
| `npm run build` | Production build of app and worker |
| `npm run db:generate -- --name <name>` | New migration from `db/schema.ts` changes |
| `npm run db:migrate:local` | Apply migrations to the local database |
| `npm run db:seed:local` | Load the base demo data |
| `npm run db:seed:bulk` | Load-test data: 10,000 subscriptions, 30,000 invoices (local only) |
| `npm run db:reset:local` | Delete the local database, migrate and seed again |
| `npm run deploy` | Build and deploy to Cloudflare |

## Deploy to Cloudflare (free plan)

```bash
npx wrangler login
npx wrangler d1 create brightloop          # copy the database_id into wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```

Then set `APP_URL` in `wrangler.jsonc` to the deployed URL. Do not run the bulk load-test seed against remote D1 (free plan: 100k row writes per day). Optional AI copilot: `npx wrangler secret put AI_PROVIDER` (`groq` or `gemini`) and `npx wrangler secret put AI_API_KEY`.

## Features

- Accounts and roles (admin, staff, customer), password reset, admin-only staff management, roles matrix.
- Products with variants, plans with lifecycle switches, taxes, discount rules, quotation templates and quotations.
- Subscriptions with a Draft → Quotation → Confirmed → Active → Closed lifecycle (plus pause), status history, renewals.
- Daily billing run (plus "Run billing now"): one invoice per period, never twice, missed periods caught up; taxes and the best eligible discount applied per line.
- Invoices (edit draft, confirm, cancel, send, print/PDF), partial and multiple payments, unmatched receipts, outstanding and overdue views.
- Dashboard, revenue, MRR, subscription, payment and overdue reports with CSV export.
- Standout: revenue leakage detector, invoice anomaly detection, smart dunning, customer health score, renewal management, cancellation and retention flow, Customer 360° timeline, what-if simulator, optional AI finance copilot.
- Customer portal: own subscriptions (accept, pause, resume, renew, cancel), invoices and payments.

Ownership by person is in [team ownership](docs/team-ownership.md).

## Documentation

- [Architecture](docs/architecture.md) — stack, free-plan guardrails, billing correctness
- [Database schema](docs/database-schema.md)
- [API and service contracts](docs/api-contracts.md)
- [Design system](docs/design-system.md)
- [Team ownership](docs/team-ownership.md)
- [Contribution guide](docs/contribution-guide.md)
- Product: [PRD](docs/PRD%20Subscription%20Management%20System%20(Brightloop).pdf), [features](docs/subscription_management_system_features.md), [standout features](docs/subscription_management_standout_features_no_ai.md)
