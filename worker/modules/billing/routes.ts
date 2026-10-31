/**
 * INV-4: "Run billing now" and billing run history. Owner: Person 1.
 */
import { count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { isoDateSchema } from "../../../shared/schemas";
import type { BillingRunResult } from "../../../shared/types";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { schema } from "../../lib/db";
import { ApiError } from "../../lib/errors";
import { pageOffset, paginated } from "../../lib/pagination";
import { validate } from "../../lib/validate";
import { runBilling } from "./service";

const runSchema = z.object({
  /** Demo mode only: bill "as of" another date to simulate a month of billing. */
  asOf: isoDateSchema.optional(),
});

export const billingRoutes = new Hono<AppEnv>()
  .use(requirePermission("billing:run"))

  .post("/run", validate("json", runSchema), async (c) => {
    const { asOf } = c.req.valid("json");
    if (asOf && c.env.DEMO_MODE !== "true") throw ApiError.forbidden("Billing for another date is available in demo mode only.");
    const result = await runBilling(c.get("db"), c.env.DB, { today: asOf, trigger: "manual", actorId: currentUser(c).id });
    return c.json({ data: result });
  })

  .get("/runs", validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const [rows, total] = await Promise.all([
      db
        .select({ r: schema.billingRuns, actorName: schema.users.name })
        .from(schema.billingRuns)
        .leftJoin(schema.users, eq(schema.users.id, schema.billingRuns.actorId))
        .orderBy(desc(schema.billingRuns.startedAt))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(schema.billingRuns).get(),
    ]);
    const data = rows.map((r) => ({ ...(r.r as BillingRunResult), actorName: r.actorName, details: r.r.details }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/config", (c) => c.json({ demoMode: c.env.DEMO_MODE === "true" }));
