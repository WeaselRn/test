# Subscription Management System --- Feature Specification

## 1. Authentication & User Management

### Features

-   Customer registration using email and password.
-   Enforce unique email addresses.
-   Password validation:
    -   Minimum 9 characters.
    -   At least one uppercase letter.
    -   At least one lowercase letter.
    -   At least one special character.
-   Customer login and authentication.
-   Forgot-password flow with a reset link sent to the registered email.
-   Role-based access control for Admin, Staff, and Customer.
-   Staff account creation restricted to Admin.
-   Customer portal that exposes only the signed-in customer's own
    subscriptions and invoices.

### Roles and permissions

  Capability           Admin   Staff     Customer
  -------------------- ------- --------- ----------
  Manage products      Yes     No        No
  Manage plans         Yes     No        No
  Manage staff         Yes     No        No
  Manage customers     Yes     Yes       No
  View subscriptions   All     All       Own only
  Manage invoices      All     All       Own only
  Record payments      Yes     Yes       No
  View reports         Yes     Limited   No

*Staff permissions beyond the specification's statement that staff have
limited access are proposed defaults and should be confirmed.*

## 2. Product Management

### Product CRUD

-   Create, view, edit, and delete products.
-   Activate or deactivate products.

### Product fields

-   Product name.
-   Product type.
-   Sales price.
-   Cost price.
-   Notes.

### Product variants

-   Add variants using attributes such as brand.
-   Configure additional prices for variants.
-   Calculate the final price from the base price and selected variant
    adjustments.

**Example:** A product with a base price of ₹2,000 and an Odoo variant
surcharge of ₹560 has a final price of ₹2,560.

## 3. Subscription Plan Management

### Plan CRUD

-   Create, view, edit, and delete plans.
-   Associate plans with products.
-   Configure plan pricing.

### Billing configuration

Support these billing frequencies: - Daily. - Weekly. - Monthly. -
Yearly.

### Plan fields and controls

-   Plan name.
-   Price.
-   Billing frequency.
-   Minimum quantity.
-   Availability start date.
-   Availability end date.
-   Configure whether the plan closes automatically at the end of its
    availability.
-   Configure whether subscriptions under the plan can be closed early,
    paused, or renewed.

The specification requires the Admin to decide which lifecycle actions
are allowed for each plan.

## 4. Quotation & Subscription Management

### Quotation templates

-   Create and manage quotation templates.
-   Add predefined plans and product lines to templates.
-   Set template validity in days.
-   Reuse templates when preparing quotations.
-   Calculate quotation expiry from its validity period.

### Subscription creation

Each subscription must have: - A unique subscription number. -
Customer. - Plan. - Start date. - Expiry date. - Payment terms.

### Subscription line items

Support multiple product lines, each containing: - Product. -
Quantity. - Unit price. - Taxes. - Line amount.

### Subscription lifecycle

`Draft → Quotation → Confirmed → Active → Closed`

### Subscription management

-   List and view subscriptions.
-   Search by subscription number or customer.
-   Filter by status.
-   View subscription details and line items.
-   Track the current lifecycle status, start date, and expiry date.

## 5. Invoice & Automated Billing Management

### Automatic recurring invoice generation

-   Identify subscriptions due for billing.
-   Generate invoices from the corresponding subscriptions.
-   Populate customer details and subscription product lines.
-   Calculate taxes and invoice totals automatically.
-   Save generated invoices.
-   Ensure each billing period is invoiced once and that due
    subscriptions are not skipped.

### Invoice management

-   Create and view invoices.
-   Edit draft invoices.
-   Confirm invoices.
-   Cancel invoices.
-   Send invoices to customers.
-   Print or download invoices.

### Invoice fields

-   Invoice number.
-   Customer details.
-   Associated subscription.
-   Invoice date.
-   Due date.
-   Product lines and quantities.
-   Taxes.
-   Subtotal.
-   Discount, where applicable.
-   Total payable amount.

### Invoice lifecycle

`Draft → Confirmed → Paid`

### Tax management

-   Allow Admin to configure tax rules.
-   Calculate applicable taxes automatically.
-   Apply taxes to invoice lines.
-   Calculate invoice totals.

### Billing safeguards

-   Prevent duplicate invoices for the same subscription billing period.
-   Ensure eligible subscriptions are processed.
-   Support safe retries for failed billing jobs.

## 6. Discount Management

### Discount rule management

-   Create, view, edit, and delete discount rules.
-   Restrict discount-rule creation to Admin.

### Discount types

-   Fixed amount.
-   Percentage.

### Discount conditions

-   Minimum purchase amount.
-   Minimum quantity.
-   Start date.
-   End date.
-   Maximum number of uses.

### Discount application

-   Apply discounts to specific products.
-   Apply discounts to entire subscriptions.
-   Automatically apply eligible discounts to the next invoice.
-   Stop applying discounts after their expiry date.
-   Stop applying discounts when their usage limit is reached.

## 7. Payment Management

### Payment recording

Allow Admin and Staff to record payments with: - Payment method. -
Amount. - Payment date. - Note. - Associated invoice.

### Payment methods

Support configurable methods, for example: - Bank transfer. - Cash. -
UPI. - Card. - Other.

### Payment tracking

-   View all payments.
-   View payments associated with an invoice.
-   Maintain payment history.
-   Identify fully paid invoices.
-   Identify outstanding invoices.
-   Track overdue invoices.

### Payment relationships

Support partial payments and multiple payments against one invoice,
rather than assuming that one payment always settles one invoice.

## 8. Finance Dashboard & Reporting

### Dashboard metrics

-   Active subscription count.
-   Revenue received.
-   Outstanding amount.
-   Overdue invoice count.

### Reports

-   Active subscription report.
-   Revenue report.
-   Outstanding balance report.
-   Overdue invoice report.
-   Payment report.
-   Subscription report.

### Filters

-   Date range.
-   Customer.
-   Subscription status.
-   Invoice status.
-   Payment status.

### Performance requirement

Every page should respond in under two seconds, including when the
system contains thousands of subscriptions.

### Performance considerations

-   Add appropriate database indexes.
-   Use pagination for large lists.
-   Apply filtering and sorting on the server.
-   Optimize database queries.
-   Cache dashboard aggregates where appropriate.

## 9. Application Navigation

### Admin and Staff application

  Sidebar section   Pages
  ----------------- ----------------------------------------
  Overview          Dashboard
  Sales             Quotations, Quotation Templates
  Subscriptions     All Subscriptions, Plans
  Products          Products, Variants
  Billing           Invoices, Taxes
  Discounts         Discount Rules
  Payments          Payments, Outstanding Invoices
  Customers         Customer Directory
  Reports           Revenue, Subscription, Payment Reports
  Settings          Staff, Roles, System Settings

### Customer portal

Provide a separate customer-facing interface where customers can: - View
their own subscriptions. - View their own invoices. - View payment
history.

## 10. Recommended Development Order

1.  Authentication and role permissions.
2.  Product and plan management.
3.  Quotations and subscriptions.
4.  Invoice generation and tax calculations.
5.  Discount management.
6.  Payment recording and tracking.
7.  Finance dashboard and reports.
8.  Customer portal.

## 11. Critical End-to-End Workflow

The core business workflow is:

1.  Admin creates products and subscription plans.
2.  Sales staff prepares a quotation using a template.
3.  The quotation is confirmed and becomes a subscription.
4.  The subscription becomes active.
5.  The billing engine identifies when the next billing period is due.
6.  The system generates an invoice with the correct product lines,
    taxes, and eligible discounts.
7.  Staff records payments against the invoice.
8.  The system updates invoice payment status and outstanding balances.
9.  The finance dashboard reflects subscription, revenue, payment, and
    overdue-invoice information.

**Implementation priority:** Make the subscription → recurring billing →
invoice → payment lifecycle reliable before investing heavily in
dashboard polish.

------------------------------------------------------------------------

## Scope notes

-   The feature list is based on the supplied *Subscription Management
    System* specification.
-   Staff permission details beyond the requirement for limited access
    are proposed and need confirmation.
-   Payment methods listed are examples; the source does not prescribe a
    fixed list.
-   Partial payments and multiple payments per invoice are
    implementation recommendations, not explicit source requirements.
-   Database indexes, pagination, server-side filtering, query
    optimization, and caching are suggested approaches to meet the
    stated response-time requirement.
