# Standout Features for the Subscription Management System

## Hackathon implementation plan with one Gemini API key

## 1. Goal

Build differentiating features without depending heavily on AI or
frequent Gemini API calls.

The recommended approach is: - Use normal application code and database
queries for financial calculations, detection, scoring, workflows, and
automation. - Use Gemini only for optional natural-language explanations
or summaries. - Make every important feature work even when Gemini is
unavailable or its quota is exhausted.

**Important:** One API key does not guarantee unlimited usage. Actual
limits depend on the Gemini model, project, account tier, and current
quota. The design below minimizes calls rather than assuming a
particular quota.

------------------------------------------------------------------------

## 2. Recommended standout features

### Feature 1: Revenue Leakage Detector

**AI required:** No\
**Gemini calls:** Zero

Find revenue the business may be losing because of missed or incorrect
processes.

#### Detect

-   Active subscriptions with no invoice for an expected billing period.
-   Duplicate invoices for the same subscription and billing period.
-   Payments received but not matched to an invoice.
-   Discounts applied after their expiry date.
-   Discounts used beyond their configured usage limit.
-   Invoices associated with closed or expired subscriptions.
-   Subscriptions nearing expiry without a renewal quotation or
    decision.

#### User experience

Create a Revenue Leakage page with: - Total value of issues
identified. - Number of issues by category. - Severity: Critical, High,
Medium, Low. - Customer and subscription references. - Explanation of
each issue. - Suggested resolution. - Mark as reviewed or resolved.

#### Implementation

Use scheduled jobs and database queries to compare subscriptions,
billing periods, invoices, discounts, and payments.

For each issue, store: - Issue type. - Related customer, subscription,
invoice, or payment. - Estimated amount affected. - Detection date. -
Status. - Resolution notes.

Do not label every flagged amount as confirmed lost revenue. Show it as
**potential revenue at risk** until verified.

------------------------------------------------------------------------

### Feature 2: Smart Dunning --- Payment Recovery Automation

**AI required:** No\
**Gemini calls:** Zero

Automatically manage reminders for overdue invoices.

#### Features

-   Detect unpaid and overdue invoices.
-   Configure reminder intervals.
-   Send or prepare reminders at each stage.
-   Escalate long-overdue invoices to staff.
-   Stop reminders when payment is recorded.
-   Maintain a reminder history.
-   Show recovery rate and outstanding balance.

#### Example workflow

  Timing             Action
  ------------------ ----------------------------------------
  Before due date    Payment due reminder
  3 days overdue     Friendly reminder
  7 days overdue     Second reminder and staff notification
  14 days overdue    Escalate to finance team
  Payment received   Stop reminders and update invoice

Make the schedule configurable by the admin.

#### Hackathon implementation

If email integration is unavailable, build an in-app notification centre
and a simulated email outbox. Clearly label simulated messages as demos;
do not claim that real emails were sent.

------------------------------------------------------------------------

### Feature 3: Customer Subscription Health Score

**AI required:** No\
**Gemini calls:** Zero

Calculate a transparent customer health score using rules instead of an
ML model.

#### Possible signals

-   Recent late payments.
-   Number of failed payments.
-   Overdue invoice amount.
-   Subscription expiry approaching.
-   Recent downgrade.
-   Repeated pauses or cancellations.
-   Payment history.

#### Example scoring approach

Start each customer at 100 points and subtract configurable penalties.

  Signal                                         Example penalty
  -------------------------------------------- -----------------
  One late payment                                           -10
  Repeated late payments                                     -15
  Failed payment                                             -15
  Invoice significantly overdue                              -20
  Subscription expiring soon without renewal                 -10
  Recent downgrade                                           -10

Clamp the final score between 0 and 100.

#### Risk categories

  Score     Category
  --------- -----------------
  80--100   Healthy
  50--79    Needs attention
  0--49     At risk

These are example rules and thresholds. Tune them using the demo data
and business requirements.

#### User experience

-   Customer health score on the customer profile.
-   Filter customers by risk category.
-   Show the exact reasons behind each score.
-   Recommend a next action, such as contacting the customer or
    preparing a renewal offer.

Do not present a rule-based score as a statistically validated churn
probability.

------------------------------------------------------------------------

### Feature 4: What-if Financial Simulator

**AI required:** No\
**Gemini calls:** Zero

Let the finance lead test business decisions before applying them.

#### Scenarios

-   Increase or decrease subscription prices.
-   Simulate a percentage of customers cancelling.
-   Offer a discount to selected customers.
-   Improve payment recovery.
-   Estimate the impact of renewals or downgrades.

#### Outputs

-   Projected MRR.
-   Projected ARR.
-   Projected revenue.
-   Estimated outstanding balance.
-   Estimated customer count.
-   Difference from the current baseline.

#### Example

If current MRR is ₹8,40,000 and prices increase by 10%, the simple
no-churn projection is ₹9,24,000.

Clearly state assumptions. A price increase does not guarantee that
customers will stay, so show a separate churn assumption when modelling
a realistic scenario.

#### Implementation

Use frontend controls or a backend calculation endpoint. Keep the
calculation deterministic and show the formulas or assumptions.

------------------------------------------------------------------------

### Feature 5: Smart Renewal Management

**AI required:** No\
**Gemini calls:** Zero

Prevent subscriptions from silently expiring.

#### Features

-   Identify subscriptions approaching expiry.
-   Configure renewal reminder periods.
-   Create renewal quotations from existing subscriptions.
-   Suggest the current plan or eligible alternative plans.
-   Track renewal status.
-   Notify staff about renewals requiring attention.
-   Record whether a subscription was renewed, cancelled, or allowed to
    expire.

#### Useful dashboard

Show: - Renewals due in 7 days. - Renewals due in 30 days. - Renewal
quotations awaiting response. - Renewed subscriptions. - Expired
subscriptions.

Use scheduled jobs to create reminders and renewal tasks.

------------------------------------------------------------------------

### Feature 6: Smart Cancellation & Retention

**AI required:** No\
**Gemini calls:** Zero

Make cancellation a structured retention workflow.

#### Cancellation flow

When a customer requests cancellation: 1. Ask for a cancellation reason.
2. Display an appropriate alternative where available. 3. Let the
customer choose to continue or confirm cancellation. 4. Record the
outcome and reason.

#### Example alternatives

  Cancellation reason     Suggested alternative
  ----------------------- ------------------------------
  Too expensive           Show a cheaper eligible plan
  Temporary requirement   Offer pause, if permitted
  Missing features        Show a suitable higher plan
  Not using the product   Offer a downgrade

#### Analytics

Track: - Cancellation requests. - Cancellation reasons. - Customers who
accepted an alternative. - Customers who completed cancellation. -
Retention rate after an alternative was offered.

Do not obstruct cancellation or hide the cancellation action.

------------------------------------------------------------------------

### Feature 7: Customer 360° Timeline

**AI required:** No\
**Gemini calls:** Zero

Give staff one consolidated view of each customer's relationship with
the business.

#### Timeline events

-   Customer registration.
-   Quotation created and sent.
-   Subscription created and activated.
-   Plan upgrade or downgrade.
-   Invoice generated.
-   Payment received or failed.
-   Reminder sent.
-   Subscription paused, renewed, or cancelled.
-   Staff notes.

#### User experience

-   Customer profile with contact and account details.
-   Active subscriptions and current plans.
-   Outstanding invoices and payment history.
-   Chronological activity timeline.
-   Internal notes for staff.

Implement this using an activity/event table populated whenever relevant
actions occur.

------------------------------------------------------------------------

### Feature 8: Invoice Anomaly Detection

**AI required:** No\
**Gemini calls:** Zero

Flag suspicious or inconsistent invoice records using deterministic
checks.

#### Checks

-   Duplicate invoice for the same billing period.
-   Invoice total does not equal line items, taxes, and discounts.
-   Discount exceeds configured limits.
-   Invoice generated for a closed subscription.
-   Unexpected change in invoice amount compared with previous periods.
-   Missing customer or subscription references.

#### User experience

-   Anomaly list.
-   Severity and reason.
-   Expected versus actual amount, where relevant.
-   Link to the invoice.
-   Mark as reviewed or resolved.

Use exact validation rules for accounting calculations. For unusual
amount changes, use configurable thresholds and label the result as an
alert, not proof of fraud.

------------------------------------------------------------------------

### Feature 9: Subscription Usage & Value Insights

**AI required:** No\
**Gemini calls:** Zero, provided usage data exists

Show customers and staff how much of a subscription's capacity is being
used.

#### Possible metrics

-   Seats purchased versus seats used.
-   Storage allowance versus storage used.
-   API quota versus API calls used.
-   Add-ons enabled versus unused.
-   Usage trends over time.

#### Recommendations

-   Suggest a downgrade when a customer consistently uses far less than
    their plan allows.
-   Suggest an upgrade when usage approaches a plan limit.
-   Highlight paid add-ons that are not being used.

This feature requires usage data from the subscribed product. For a
hackathon demonstration, provide a clearly identified sample usage
dataset if no real integration exists.

------------------------------------------------------------------------

## 3. Optional Gemini-powered feature: AI Finance Copilot

**AI required:** Yes\
**Gemini calls:** Only when a user submits a question or requests an
explanation.

This is the one AI feature worth keeping, provided the rest of the
application does not depend on it.

### What it should do

Allow admins to ask questions such as: - Which customers have overdue
invoices above ₹10,000? - How much revenue did we receive this month? -
Which subscriptions expire next week? - Explain the revenue leakage
alerts. - Summarize the customers at risk.

### Recommended architecture

1.  User submits a question.
2.  Backend identifies the supported query type.
3.  Backend retrieves the relevant figures from the database using
    controlled queries.
4.  Backend sends only the necessary, aggregated context to Gemini.
5.  Gemini produces a concise natural-language explanation.
6.  The UI displays the answer with links to the underlying records.

### Important safeguards

-   Never let the model invent financial figures.
-   Do not let Gemini directly execute arbitrary SQL.
-   Use predefined, validated backend query functions.
-   Keep authorization checks in the backend.
-   Do not send unnecessary customer personal information to the model.
-   Require confirmation before actions such as sending reminders or
    changing subscriptions.
-   Provide a normal dashboard/report fallback when Gemini is
    unavailable.

### Minimize Gemini usage

-   Make calls only when the user explicitly asks a question.
-   Avoid calling Gemini for every dashboard load.
-   Cache repeated questions and answers when the underlying data has
    not changed.
-   Limit input and output token sizes.
-   Apply per-user request throttling.
-   Use a single configured Gemini model.
-   Handle quota errors gracefully.
-   Do not automatically retry repeatedly after a quota error.

**Do not assume a single API key removes quota restrictions.** Check the
selected model's current rate limits and project quota before the demo.
The AI Copilot should remain optional.

------------------------------------------------------------------------

## 4. Recommended final feature selection

For a hackathon, implement these six first:

    Priority Feature                              AI dependency
  ---------- ------------------------------------ ------------------------
           1 Revenue Leakage Detector             None
           2 Smart Dunning                        None
           3 Customer Subscription Health Score   None
           4 What-if Financial Simulator          None
           5 Smart Renewal Management             None
           6 AI Finance Copilot                   One Gemini integration

If time permits, add: - Smart Cancellation & Retention. - Customer 360°
Timeline. - Invoice Anomaly Detection.

Usage Insights is also useful, but only if you can obtain or
convincingly simulate product usage data.

------------------------------------------------------------------------

## 5. Suggested implementation order

### Phase 1 --- Core data and detection

1.  Ensure subscription, invoice, payment, discount, and customer
    relationships are correct.
2.  Build the Revenue Leakage Detector.
3.  Build Invoice Anomaly Detection.
4.  Build the Customer 360° Timeline.

### Phase 2 --- Automation

1.  Build scheduled overdue-invoice detection.
2.  Build Smart Dunning.
3.  Build Renewal Management.
4.  Add notification and reminder history.

### Phase 3 --- Intelligence without AI

1.  Implement the rule-based health score.
2.  Build the What-if Simulator.
3.  Build cancellation reason tracking and retention alternatives.

### Phase 4 --- Gemini integration

1.  Implement a small set of supported finance queries.
2.  Retrieve figures through backend functions.
3.  Send compact context to Gemini.
4.  Cache responses and add rate limiting.
5.  Test the fallback when the API is unavailable.

------------------------------------------------------------------------

## 6. Suggested architecture

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  Frontend                            Dashboards, controls, customer
                                      portal, reports

  Backend API                         Business rules, validation,
                                      authorization

  Database                            Customers, plans, subscriptions,
                                      invoices, payments, events

  Scheduled jobs                      Billing, overdue checks, renewal
                                      checks, dunning

  Rules engine                        Leakage checks, anomaly checks,
                                      health scores

  Calculation module                  Forecasts and what-if simulations

  Gemini integration                  Optional natural-language
                                      explanations and summaries
  -----------------------------------------------------------------------

Keep financial calculations and business-critical decisions
deterministic. Gemini should explain the data, not become the source of
truth.

------------------------------------------------------------------------

## 7. Demo strategy

Use a seeded dataset with realistic scenarios:

-   A customer with two overdue invoices.
-   An active subscription missing its expected invoice.
-   A payment that has not been matched to an invoice.
-   A discount that has expired.
-   A customer whose subscription expires in seven days.
-   A customer with repeated late payments.
-   A duplicate invoice.
-   A customer who requests cancellation because of price.

Then demonstrate:

1.  The Revenue Leakage Detector identifies the missing invoice and
    unmatched payment.
2.  The Health Score flags the customer with repeated late payments.
3.  Smart Dunning prepares the correct reminder.
4.  Renewal Management prepares a renewal quotation.
5.  The What-if Simulator shows the effect of a pricing change.
6.  The Gemini Copilot explains the findings using actual database
    figures.

Label seeded records and simulated actions clearly. Do not represent
demo events as real customer activity or real email delivery.

------------------------------------------------------------------------

## 8. Final recommendation

Build the product so that **six standout capabilities work without
Gemini**, and Gemini adds a conversational layer on top.

This gives you: - Predictable API usage. - No dependency on AI
availability for critical workflows. - More reliable financial
calculations. - A stronger live demo. - A credible architecture that can
scale beyond the hackathon.

The core differentiator should be:

**Detect revenue problems → Explain why they happened → Recommend an
action → Help the business recover the money.**
