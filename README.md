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

## Project status

The shared foundation is complete: schema for every module, shared contracts, auth and roles, staff management, design system and app shell. Feature modules are built in parallel by four owners; see [team ownership](docs/team-ownership.md). Placeholder pages name each module's owner until the module lands.

## Documentation

- [Architecture](docs/architecture.md) — stack, free-plan guardrails, billing correctness
- [Database schema](docs/database-schema.md)
- [API and service contracts](docs/api-contracts.md)
- [Design system](docs/design-system.md)
- [Team ownership](docs/team-ownership.md)
- [Contribution guide](docs/contribution-guide.md)
- Product: [PRD](docs/PRD%20Subscription%20Management%20System%20(Brightloop).pdf), [features](docs/subscription_management_system_features.md), [standout features](docs/subscription_management_standout_features_no_ai.md)
