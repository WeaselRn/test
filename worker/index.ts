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
import { authRoutes } from "./modules/auth/routes";
import { staffRoutes } from "./modules/staff/routes";
import { systemRoutes } from "./modules/system/routes";

const routes = new Hono<AppEnv>()
  .route("/auth", authRoutes)
  .route("/staff", staffRoutes)
  .route("/", systemRoutes);
// Person 2: .route("/products", productRoutes).route("/plans", planRoutes) ...
// Person 3: .route("/invoices", invoiceRoutes).route("/payments", paymentRoutes) ...
// Person 4: .route("/customers", customerRoutes).route("/portal", portalRoutes) ...

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
