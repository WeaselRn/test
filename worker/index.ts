/**
 * Brightloop API worker. Serves /api/v1/* and the daily cron. Static assets (the
 * React app) are served by Workers Static Assets before this code runs.
 *
 * Module routers are mounted in `routes` below. Each owner adds one line for their
 * module in their PR; do not put route handlers in this file.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { API_BASE } from "../shared/api";
import type { AppEnv } from "./env";
import { runScheduledJobs } from "./jobs/scheduler";
import { loadSession } from "./lib/auth";
import { createDb } from "./lib/db";
import { ApiError, errorResponse } from "./lib/errors";
// Person 1 — core
import { aiRoutes } from "./modules/ai/routes";
import { authRoutes } from "./modules/auth/routes";
import { billingRoutes } from "./modules/billing/routes";
import { staffRoutes } from "./modules/staff/routes";
import { subscriptionRoutes } from "./modules/subscriptions/routes";
import { systemRoutes } from "./modules/system/routes";
// Person 2 — catalog & sales
import { discountRoutes } from "./modules/discounts/routes";
import { planRoutes } from "./modules/plans/routes";
import { productRoutes, variantRoutes } from "./modules/products/routes";
import { quotationRoutes, templateRoutes } from "./modules/quotations/routes";
import { taxRoutes } from "./modules/taxes/routes";
// Person 3 — finance
import { findingRoutes } from "./modules/finance/routes";
import { invoiceRoutes } from "./modules/invoices/routes";
import { invoicePaymentRoutes, paymentRoutes } from "./modules/payments/routes";
import { reportRoutes } from "./modules/reports/routes";
// Person 4 — customer
import { customerRoutes } from "./modules/customers/routes";
import { demoRoutes } from "./modules/demo/routes";
import { dunningRoutes } from "./modules/dunning/routes";
import { portalRoutes } from "./modules/portal/routes";
import { renewalRoutes } from "./modules/renewals/routes";
import { retentionRoutes } from "./modules/retention/routes";
import { simulatorRoutes } from "./modules/simulator/routes";

const routes = new Hono<AppEnv>()
  // Person 1
  .route("/auth", authRoutes)
  .route("/staff", staffRoutes)
  .route("/subscriptions", quotationRoutes)
  .route("/subscriptions", subscriptionRoutes)
  .route("/billing", billingRoutes)
  .route("/ai", aiRoutes)
  .route("/", systemRoutes)
  // Person 2
  .route("/products", productRoutes)
  .route("/variants", variantRoutes)
  .route("/plans", planRoutes)
  .route("/taxes", taxRoutes)
  .route("/discounts", discountRoutes)
  .route("/quotation-templates", templateRoutes)
  // Person 3
  .route("/invoices", invoicePaymentRoutes)
  .route("/invoices", invoiceRoutes)
  .route("/payments", paymentRoutes)
  .route("/reports", reportRoutes)
  .route("/findings", findingRoutes)
  // Person 4
  .route("/customers", customerRoutes)
  .route("/portal", portalRoutes)
  .route("/dunning", dunningRoutes)
  .route("/renewals", renewalRoutes)
  .route("/retention", retentionRoutes)
  .route("/simulator", simulatorRoutes)
  .route("/demo", demoRoutes);

const app = new Hono<AppEnv>()
  .use("*", secureHeaders())
  .use(`${API_BASE}/*`, async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
  })
  .use(`${API_BASE}/*`, loadSession)
  .route(API_BASE, routes)
  .all(`${API_BASE}/*`, () => {
    throw new ApiError("not_found", "Endpoint not found.");
  });

app.onError((err, c) => errorResponse(c, err));

export type ApiRoutes = typeof routes;

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledJobs(env));
  },
} satisfies ExportedHandler<Env>;
