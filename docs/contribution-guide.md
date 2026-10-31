# Contribution guide

## Daily workflow

```bash
git checkout main && git pull
git checkout -b feature/products-plans        # your slice branch, or feature/<slice>-<topic>
npm install
npm run db:migrate:local
npm run dev                                   # http://localhost:5173
```

Before every push:

```bash
npm run typecheck
npm test
npm run build
```

Rebase on `main` every hour; merge to `main` every 45–60 minutes through a PR.

## Rules

1. Stay inside your folders (`docs/team-ownership.md`). To change a shared file (`db/schema.ts`, `shared/*`, `worker/lib/*`, `src/components/*`, `src/app/*`, `worker/index.ts`), explain the change and impact in the PR and get the owner's review.
2. Never redefine a shared type or schema in a module. Extend `shared/types.ts` / `shared/schemas` in a reviewed PR.
3. Money is integer minor units in the database and 2-decimal strings in the API. Never use floats for financial calculations; use `shared/money.ts` and `shared/pricing.ts`.
4. Billing, taxes, discounts, payment allocation, permissions and lifecycle rules are deterministic code. Never use an LLM for them.
5. Every protected route uses `requirePermission(...)`. Portal queries filter by `ownCustomerId(c)`.
6. State changes go through action endpoints and write `auditEntry` and, for customer-facing events, `activityEntry`.
7. Lists are paginated on the server. No endpoint returns an unbounded list.
8. Scheduled work is registered in `worker/jobs/scheduler.ts` and must be idempotent. Do not add cron triggers.
9. Outgoing messages go through `worker/lib/notifications.ts`. Label simulated emails as simulated; do not claim real delivery.
10. One migration per PR, announced before merge. Never edit a migration on `main`.
11. Do not add dependencies without the tech lead's OK; check that they run on Workers and keep the free plan.

## Adding a module (checklist)

1. `worker/modules/<name>/routes.ts` (+ `service.ts`); mount it in `worker/index.ts` with one line.
2. Validate inputs with schemas from `shared/schemas`; guard with `requirePermission`.
3. `src/modules/<name>/*-page.tsx`; replace the placeholder route in `src/app/router.tsx`.
4. Reuse `Page`, `PageHeader`, `DataTable`, `Field`, `Dialog`, `useToast` (see `src/modules/staff/staff-page.tsx`).
5. Tests: unit tests in `tests/unit`, API tests in `tests/integration` (use `tests/integration/helpers.ts`).
6. Update `docs/api-contracts.md` (status → Implemented) and seed rows for your tables in `scripts/seed.ts`.

## Commits and PRs

Conventional Commits: `feat(products): add variant pricing`, `fix(billing): prevent duplicate invoice`, `test(payments): cover partial payments`, `docs(architecture): …`.

PRs stay under ~400 changed lines, link the requirement ID, and include: summary, files/modules changed, screenshots for UI, tests run and results, migration details, known limitations, and confirmation that shared contracts were respected. CI (typecheck, tests, build) must pass and one teammate who did not write the code approves.
