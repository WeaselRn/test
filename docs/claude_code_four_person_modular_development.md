# Claude Code Development Instructions

## Modular four-person development plan --- Subscription Management System

> **Purpose:** Use this document as the implementation brief for Claude
> Code. Build the application as one cohesive repository with shared
> architecture and four clearly separated ownership areas, so four team
> members can develop, test, and submit their work through independent
> Git branches and pull requests.

------------------------------------------------------------------------

# 1. Instructions to Claude Code

Act as the lead software architect and implementation assistant for this
project.

Your job is to help build a complete Subscription Management System
while preserving a modular structure that supports four developers
working in parallel.

Follow these rules throughout development:

1.  Do not generate the entire application as one tightly coupled
    implementation.
2.  Establish the architecture, database schema, shared types, design
    system, and module contracts before implementing feature modules.
3.  Keep module ownership and file boundaries explicit.
4.  Make modules integrate through shared types, documented service
    interfaces, and agreed database contracts.
5.  Avoid duplicate implementations of authentication, navigation,
    layout, database clients, shared UI, and common utilities.
6.  Keep financial calculations and business-critical rules
    deterministic. Do not use an LLM for billing, taxes, payment
    balances, discount calculations, or access-control decisions.
7.  Do not overwrite another developer's module or shared files without
    explaining the reason and identifying the impact.
8.  Prefer small, testable implementation steps over one enormous
    code-generation operation.
9.  Make each module independently understandable, testable, and
    reviewable.
10. Do not claim that a feature works until it has been implemented and
    tested.

Before making architectural assumptions, inspect the existing
repository. If it is empty, propose the stack and architecture, then
create the foundation. If the repository already contains code, preserve
and adapt it rather than replacing it unnecessarily.

------------------------------------------------------------------------

# 2. Product Scope

Build a subscription management platform that supports the complete
lifecycle of a subscription business:

-   Authentication and role-based access.
-   Product and product variant management.
-   Subscription plan management.
-   Quotations and quotation templates.
-   Subscription creation and lifecycle management.
-   Recurring billing and invoice generation.
-   Tax and discount management.
-   Payment recording and reconciliation.
-   Customer management and self-service portal.
-   Finance dashboards and reporting.
-   Revenue leakage detection.
-   Invoice anomaly detection.
-   Payment reminder automation.
-   Customer subscription health scoring.
-   Renewal management.
-   What-if financial simulation.
-   Optional Gemini-powered Finance Copilot.

The product must be a cohesive application, not a collection of
disconnected demo screens.

------------------------------------------------------------------------

# 3. Four-Person Ownership Model

Use the following ownership boundaries. These are the default boundaries
for Git branches, folders, implementation tasks, and pull requests.

## Person 1 --- Tech Lead: Core Backend, Architecture & AI

**Git branch:** `feature/core-backend`

**Primary responsibility:** Shared infrastructure, authentication, core
business logic, integration, and optional AI integration.

### Owns

-   Authentication and authorization.
-   Role-based access control.
-   Shared database schema and migration coordination.
-   Customer and staff account foundations.
-   Subscription lifecycle and state transitions.
-   Recurring billing engine.
-   Invoice generation service and core financial calculations.
-   Shared backend services and API conventions.
-   Gemini Finance Copilot integration.
-   Cross-module integration and release coordination.

### Deliverables

-   Authentication flows.
-   Permission checks.
-   Shared database client and server utilities.
-   Shared types and service contracts.
-   Subscription lifecycle services.
-   Billing scheduler/job logic.
-   Invoice calculation and generation services.
-   Gemini integration with quota-safe fallback.
-   Integration tests and final deployment.

### Must coordinate with

-   Person 2 on product, plan, quotation, and subscription data.
-   Person 3 on invoice, tax, discount, and payment contracts.
-   Person 4 on customer access, health-score inputs, renewals, and
    portal permissions.

------------------------------------------------------------------------

## Person 2 --- Product, Plans & Sales Module

**Git branch:** `feature/products-plans`

**Primary responsibility:** Product catalogue, pricing configuration,
plans, and quotation workflows.

### Owns

-   Product CRUD.
-   Product types.
-   Product sales price and cost price.
-   Product notes and activation status.
-   Product variants and price adjustments.
-   Subscription plan CRUD.
-   Billing frequency configuration.
-   Minimum quantities.
-   Plan availability dates.
-   Plan lifecycle permissions/configuration.
-   Quotation templates.
-   Quotation creation and editing.
-   Quotation validity and expiry.
-   Product, plan, and quotation user interfaces.

### Suggested folder ownership

-   `src/modules/products/`
-   `src/modules/plans/`
-   `src/modules/quotations/`
-   Relevant route pages under `src/app/products/`, `src/app/plans/`,
    and `src/app/quotations/`

### Deliverables

-   Product listing, create, edit, and detail screens.
-   Variant management interface.
-   Plan listing and configuration screens.
-   Quotation template management.
-   Quotation creation workflow.
-   Validation and tests for pricing and plan configuration.

### Must coordinate with

-   Person 1 for shared types, permissions, and subscription creation
    contracts.
-   Person 3 for product, tax, and price data needed by invoices.
-   Person 4 for customer-facing plan and renewal information.

------------------------------------------------------------------------

## Person 3 --- Finance, Invoices & Payments Module

**Git branch:** `feature/finance-payments`

**Primary responsibility:** Finance operations, invoice interfaces,
payment tracking, and financial issue detection.

### Owns

-   Invoice listing and detail interfaces.
-   Invoice status management interface.
-   Invoice sending/printing interface.
-   Payment recording.
-   Payment history.
-   Invoice-payment associations.
-   Outstanding invoice views.
-   Tax configuration interface.
-   Revenue Leakage Detector.
-   Invoice Anomaly Detection.
-   Finance-related reporting components.

### Suggested folder ownership

-   `src/modules/invoices/`
-   `src/modules/payments/`
-   `src/modules/finance/`
-   `src/modules/revenue-leakage/`
-   `src/modules/anomaly-detection/`
-   Relevant route pages under `src/app/invoices/`, `src/app/payments/`,
    and `src/app/finance/`

### Deliverables

-   Invoice list, detail, and action screens.
-   Payment recording and history screens.
-   Outstanding invoice tracking.
-   Revenue leakage findings with severity, amount, explanation, and
    resolution status.
-   Invoice anomaly list and review workflow.
-   Tests for payment allocation, invoice status display, and detection
    rules.

### Important boundary

Person 1 owns the authoritative invoice-generation and financial
calculation services. Person 3 owns finance-facing interfaces and
detection workflows. Agree on service contracts before either side
implements dependent code.

### Must coordinate with

-   Person 1 for invoice generation, taxes, financial calculations, and
    payment data contracts.
-   Person 2 for product and quotation line-item structures.
-   Person 4 for customer context and dunning notifications.

------------------------------------------------------------------------

## Person 4 --- Customer Experience & Intelligence Module

**Git branch:** `feature/customer-intelligence`

**Primary responsibility:** Customer-facing experiences, customer
context, retention workflows, and operational intelligence interfaces.

### Owns

-   Customer directory interface.
-   Customer 360° profile.
-   Customer activity timeline.
-   Customer self-service portal.
-   Subscription health score.
-   Smart Dunning workflow and reminder interfaces.
-   Renewal management interface.
-   Smart cancellation and retention flow.
-   What-if financial simulator.

### Suggested folder ownership

-   `src/modules/customers/`
-   `src/modules/customer-portal/`
-   `src/modules/customer-health/`
-   `src/modules/dunning/`
-   `src/modules/renewals/`
-   `src/modules/retention/`
-   `src/modules/simulator/`
-   Relevant route pages under `src/app/customers/` and
    `src/app/portal/`

### Deliverables

-   Customer directory and profile.
-   Chronological customer activity timeline.
-   Customer portal pages.
-   Transparent, rule-based health score with reasons.
-   Reminder schedule and reminder history interface.
-   Renewal queue and renewal quotation handoff.
-   Cancellation reason and alternative-plan flow.
-   Interactive what-if simulator with explicit assumptions.
-   Tests for health scoring, simulation calculations, and customer data
    isolation.

### Important boundary

Person 1 owns authentication, authorization, and scheduled-job
infrastructure. Person 4 owns the customer-facing workflows and their
interfaces. Smart Dunning must use agreed notification/job interfaces
rather than implementing a second scheduler.

### Must coordinate with

-   Person 1 for permissions, customer access, subscription lifecycle,
    and scheduled jobs.
-   Person 2 for available plans and renewal quotation contracts.
-   Person 3 for invoice balances, payment status, and overdue
    information.

------------------------------------------------------------------------

# 4. Shared Repository Structure

Use this as a proposed structure. Adapt it to the chosen framework, but
preserve the ownership boundaries.

``` text
subscription-management/
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── plans/
│   │   ├── quotations/
│   │   ├── subscriptions/
│   │   ├── invoices/
│   │   ├── payments/
│   │   ├── finance/
│   │   ├── customers/
│   │   ├── portal/
│   │   └── settings/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── shared/
│   │
│   ├── modules/
│   │   ├── products/
│   │   ├── plans/
│   │   ├── quotations/
│   │   ├── subscriptions/
│   │   ├── invoices/
│   │   ├── payments/
│   │   ├── finance/
│   │   ├── revenue-leakage/
│   │   ├── anomaly-detection/
│   │   ├── customers/
│   │   ├── customer-portal/
│   │   ├── customer-health/
│   │   ├── dunning/
│   │   ├── renewals/
│   │   ├── retention/
│   │   ├── simulator/
│   │   └── ai/
│   │
│   ├── lib/
│   │   ├── auth/
│   │   ├── permissions/
│   │   ├── database/
│   │   ├── validation/
│   │   ├── notifications/
│   │   └── utils/
│   │
│   └── types/
│       ├── customer.ts
│       ├── product.ts
│       ├── plan.ts
│       ├── quotation.ts
│       ├── subscription.ts
│       ├── invoice.ts
│       ├── payment.ts
│       ├── discount.ts
│       └── common.ts
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-contracts.md
│   ├── design-system.md
│   ├── team-ownership.md
│   └── contribution-guide.md
│
├── README.md
└── package.json
```

Do not force every feature into this exact structure if the selected
framework has a better convention. Keep the ownership boundaries and
shared infrastructure clear.

------------------------------------------------------------------------

# 5. Foundation Must Be Built Before Parallel Development

Claude Code must first establish the shared foundation.

Do not start all four feature modules until this foundation is reviewed
and committed.

## Foundation checklist

### A. Inspect and establish the stack

-   Inspect existing files and dependencies.
-   Confirm the frontend framework and backend architecture.
-   Confirm database and authentication provider.
-   Confirm validation and testing libraries.
-   Document the selected stack and reasons.
-   Avoid introducing unnecessary dependencies.

If the repository is empty and no stack has been chosen, propose a
suitable stack and ask for confirmation before major setup.

### B. Database design

Design the shared schema for at least: - Users and roles. - Customers. -
Staff profiles, if needed. - Products. - Product variants. - Plans. -
Plan permissions/configuration. - Quotations. - Quotation line items. -
Subscriptions. - Subscription line items. - Tax rules. - Discounts and
discount usage. - Invoices. - Invoice line items. - Payments. - Payment
allocations. - Customer activity events. - Notifications and reminder
history. - Renewal records or renewal tasks. - Revenue leakage
findings. - Invoice anomaly findings.

Document primary keys, foreign keys, indexes, relationships,
constraints, and ownership of each table.

Use appropriate decimal/numeric types for money. Avoid floating-point
arithmetic for authoritative financial calculations.

### C. Shared TypeScript contracts

Create shared types for all entities used across modules.

At minimum define: - Customer. - Product. - ProductVariant. - Plan. -
Quotation. - Subscription. - SubscriptionLine. - Invoice. -
InvoiceLine. - TaxRule. - Discount. - Payment. - PaymentAllocation. -
CustomerActivity. - Notification.

Use consistent naming and status enums. Do not let modules independently
redefine shared entity shapes.

### D. Service contracts

Document the public functions each module may call.

Examples:

``` ts
// Product services
getProducts()
getProductById(id)
createProduct(input)
updateProduct(id, input)

// Plan services
getPlans()
getPlanById(id)
createPlan(input)
updatePlan(id, input)

// Subscription services
createSubscriptionFromQuotation(id)
getSubscriptionById(id)
pauseSubscription(id)
renewSubscription(id)

// Billing services
generateInvoiceForSubscription(id, billingPeriod)
getInvoices(filters)

// Payment services
recordPayment(input)
allocatePayment(paymentId, invoiceId, amount)
getOutstandingBalance(invoiceId)

// Customer services
getCustomerProfile(id)
getCustomerTimeline(id)
```

These are illustrative contracts. Define exact input and return types,
validation, errors, and authorization requirements before
implementation.

### E. Shared design system

Create: - Application shell. - Sidebar and navigation. - Header. - Page
container. - Buttons. - Inputs. - Selects. - Dialogs. - Tables. - Status
badges. - Cards. - Empty states. - Loading states. - Error states. -
Toast/notification pattern.

Set common typography, spacing, colors, border radius, and responsive
behavior.

All four modules must reuse these components.

### F. Documentation

Create and commit: - `docs/architecture.md` -
`docs/database-schema.md` - `docs/api-contracts.md` -
`docs/design-system.md` - `docs/team-ownership.md` -
`docs/contribution-guide.md`

------------------------------------------------------------------------

# 6. Git Branching and Contribution Workflow

Use one shared GitHub repository.

## Branches

``` text
main
│
├── feature/core-backend
├── feature/products-plans
├── feature/finance-payments
└── feature/customer-intelligence
```

The tech lead creates the repository and commits the foundation to
`main`.

Each developer: 1. Clones the same repository. 2. Checks out their
assigned branch. 3. Implements only their owned module and agreed shared
changes. 4. Runs lint, type checks, and relevant tests. 5. Commits work
in meaningful increments. 6. Pushes their branch. 7. Opens a pull
request against `main`. 8. Responds to review comments. 9. Helps test
the integrated application.

## Commit convention

Use conventional commit messages:

``` text
feat(products): add product variant management
feat(plans): implement billing frequency configuration
feat(finance): add revenue leakage detection
feat(customers): add customer activity timeline
fix(billing): prevent duplicate invoice generation
test(payments): cover partial payment allocation
docs(architecture): document module boundaries
```

Do not create artificial commits just to increase contribution counts.
Commit meaningful, reviewable work.

## Pull request requirements

Every PR must include: - Summary of the implementation. - Features
completed. - Files and modules changed. - Screenshots or short recording
for UI changes. - Tests executed and results. - Database migration
details, if applicable. - Known limitations. - Confirmation that shared
contracts were respected.

The tech lead reviews and merges PRs. Require successful build and
relevant tests before merging.

------------------------------------------------------------------------

# 7. Rules for Parallel Development

Claude Code must preserve these rules when generating or modifying code.

## File ownership

-   Person 1 owns shared infrastructure and core backend.
-   Person 2 owns products, plans, and quotations.
-   Person 3 owns finance and payment interfaces and detection modules.
-   Person 4 owns customer experience and intelligence interfaces.
-   Shared files require coordination before changes.

## Dependency ownership

-   One person coordinates package dependency changes.
-   Database schema changes must be documented and communicated.
-   Migration filenames must be unique and ordered.
-   Never silently change a shared type that another module consumes.
-   Update API contracts when service signatures change.

## Integration

-   Integrate through documented interfaces.
-   Avoid circular imports between modules.
-   Keep business logic outside presentation components.
-   Do not duplicate database clients or authentication logic.
-   Use server-side authorization for protected operations.
-   Use shared formatting and validation utilities.

## Conflict handling

If a requested change crosses module boundaries: 1. Identify which
owners are affected. 2. Explain the shared files and contracts involved.
3. Propose the smallest safe interface change. 4. Update the
documentation. 5. Coordinate before changing another owner's
implementation.

------------------------------------------------------------------------

# 8. Module Acceptance Criteria

Each module is complete only when it satisfies the following.

## Person 1 --- Core Backend

-   Authentication works.
-   Role checks are enforced on the server.
-   Database migrations apply successfully.
-   Subscription lifecycle transitions are validated.
-   Billing generates invoices for due subscriptions.
-   Duplicate billing is prevented.
-   Tax and financial calculations have tests.
-   Gemini integration has a working non-AI fallback.
-   Integration tests pass.

## Person 2 --- Products, Plans & Sales

-   Product CRUD works.
-   Variant pricing is correct.
-   Plan billing frequencies and availability are configurable.
-   Plan lifecycle permissions are respected.
-   Quotation templates can be reused.
-   Quotation validity and expiry work.
-   Quotation data follows shared contracts.
-   Relevant validation and tests pass.

## Person 3 --- Finance & Payments

-   Invoice list and details load real application data.
-   Invoice actions use the agreed backend services.
-   Payments can be recorded and associated with invoices.
-   Outstanding balances are calculated correctly.
-   Partial payments are supported if included in scope.
-   Revenue leakage rules produce explainable findings.
-   Anomaly findings link to the underlying invoice.
-   Relevant tests pass.

## Person 4 --- Customer Experience & Intelligence

-   Customer data is restricted to authorized users.
-   Customer timeline displays real activity events.
-   Customer portal exposes only the signed-in customer's records.
-   Health scores show their underlying reasons.
-   Dunning workflows stop when invoices are paid.
-   Renewal workflows respect subscription permissions.
-   Cancellation alternatives do not obstruct cancellation.
-   Simulator results show assumptions and use deterministic
    calculations.
-   Relevant tests pass.

------------------------------------------------------------------------

# 9. Recommended Implementation Sequence

## Phase 1 --- Foundation

**Owner: Person 1, with team review**

-   Repository setup.
-   Architecture.
-   Database schema.
-   Shared types.
-   Service contracts.
-   Design system.
-   Authentication foundation.
-   Development instructions.

**Exit condition:** All four people can run the same base application
and understand the contracts.

## Phase 2 --- Parallel module development

**Owners: All four**

-   Person 1: Core backend, subscriptions, billing, integration
    services.
-   Person 2: Products, variants, plans, quotations.
-   Person 3: Finance, invoices, payments, detection.
-   Person 4: Customers, portal, health, dunning, renewals, simulator.

**Exit condition:** Each module builds and works against the agreed
contracts, using shared data structures.

## Phase 3 --- Integration

**Owner: Person 1, with all team members**

-   Merge reviewed pull requests.
-   Resolve type and integration errors.
-   Apply migrations in order.
-   Verify authentication and permissions.
-   Test end-to-end workflows.
-   Fix shared regressions.

**Exit condition:** The integrated application runs from a clean setup
and its critical workflows pass.

## Phase 4 --- Hackathon polish

**Owners: All four**

-   Improve visual consistency.
-   Seed realistic demonstration data.
-   Test all major interactions.
-   Prepare demo scenarios.
-   Update README and architecture documentation.
-   Prepare each member to explain their module.

------------------------------------------------------------------------

# 10. Critical End-to-End Workflow

The complete system must support this flow:

1.  Admin creates a product and its variants.
2.  Admin creates a subscription plan.
3.  Sales staff prepares a quotation from a template.
4.  Customer accepts the quotation.
5.  The system creates and activates a subscription.
6.  The billing engine identifies the next billing date.
7.  The system generates an invoice with the correct line items, taxes,
    and eligible discounts.
8.  Staff records a payment against the invoice.
9.  The system updates the outstanding balance and invoice status.
10. The finance dashboard reflects the updated figures.
11. Revenue leakage detection identifies missing or inconsistent
    records.
12. Dunning and renewal workflows create appropriate follow-up tasks.
13. Customer health and customer timeline reflect relevant events.
14. The optional Finance Copilot explains selected findings using
    verified backend data.

Do not treat isolated screens as proof that this workflow is complete.

------------------------------------------------------------------------

# 11. Gemini Integration Constraints

Only Person 1 should own the Gemini integration.

Use Gemini for: - Natural-language finance questions. - Explanations of
revenue leakage findings. - Summaries of customer or finance reports. -
Natural-language interpretation of existing metrics.

Do not use Gemini for: - Billing calculations. - Tax calculations. -
Discount eligibility. - Payment allocation. - Subscription state
transitions. - Permission checks. - Health-score calculations. - Revenue
forecasting calculations.

The backend must retrieve authoritative figures and pass only necessary
context to Gemini.

Implement: - Request throttling. - Small context payloads. - Output
limits. - Response caching where appropriate. - Graceful quota-error
handling. - A dashboard/report fallback if Gemini is unavailable.

Do not assume that a single API key provides unlimited calls. Verify the
selected model's current quota and rate limits.

------------------------------------------------------------------------

# 12. Claude Code Execution Protocol

When working from this document, Claude Code should follow this
execution protocol.

## Step 1 --- Inspect

-   Inspect the repository.
-   Identify the existing stack.
-   Identify existing files, dependencies, and conventions.
-   Report conflicts with this architecture.

## Step 2 --- Plan

Before implementing, produce: - Proposed architecture. - Database entity
and relationship list. - Shared types. - Module ownership map. - Service
contracts. - Implementation sequence. - Risks and unresolved decisions.

Do not immediately generate every feature.

## Step 3 --- Establish foundation

Implement the shared foundation and documentation. Run the application,
type checks, lint, and tests. Commit the foundation before feature
development.

## Step 4 --- Implement by module

Implement one ownership area at a time. Keep changes within its assigned
folders wherever possible.

For every module: 1. Read the shared architecture and contracts. 2. List
planned files. 3. Implement the feature in small steps. 4. Add
validation and tests. 5. Run checks. 6. Update relevant documentation.
7. Report completed work and remaining issues.

## Step 5 --- Review integration boundaries

Before completing a module, verify: - No duplicate shared infrastructure
was introduced. - Shared types were not redefined. - Database
assumptions match the schema. - The module uses the agreed service
contracts. - The module does not modify another person's ownership area
without coordination.

## Step 6 --- Final integration

-   Run the complete build.
-   Run type checks and lint.
-   Run unit and integration tests.
-   Test the critical end-to-end workflow.
-   Fix integration issues.
-   Document known limitations.
-   Prepare the final README and demo instructions.

## Important: Parallel work with separate Claude Code sessions

If developers use separate working copies or worktrees: - Each session
must read the same committed architecture and contract documents. - Each
session must stay within its assigned ownership area. - Shared changes
must be communicated and reviewed. - Do not let multiple sessions edit
the same files simultaneously. - Integrate through Git branches and pull
requests, not by manually replacing directories.

------------------------------------------------------------------------

# 13. Definition of Done

The project is ready for submission when:

-   [ ] All four modules are implemented and integrated.
-   [ ] Each team member has submitted and explained their own work.
-   [ ] All PRs are reviewed and merged.
-   [ ] Authentication and role permissions work.
-   [ ] Products, plans, quotations, and subscriptions work.
-   [ ] Recurring billing and invoice generation work.
-   [ ] Payments and outstanding balances are accurate.
-   [ ] Revenue leakage and anomaly detection produce explainable
    findings.
-   [ ] Customer portal enforces customer data isolation.
-   [ ] Health scores and simulator outputs are deterministic.
-   [ ] Gemini is optional and quota-safe.
-   [ ] The application runs from a clean setup.
-   [ ] Critical workflows pass tests.
-   [ ] Demo data and demo instructions are ready.
-   [ ] README and architecture documentation are complete.

------------------------------------------------------------------------

# Final Direction to Claude Code

Build this as one cohesive, production-minded application with four
independent ownership areas.

Prioritize shared contracts, clean module boundaries, deterministic
financial logic, real integration, and testable workflows.

Do not optimize for the number of generated files or screens. Optimize
for a system that four developers can genuinely understand, build,
review, integrate, and confidently demonstrate.
