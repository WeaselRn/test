/** Retention analytics for staff. Owner: Person 4. */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { requirePermission } from "../../lib/auth";
import { retentionStats } from "./service";

export const retentionRoutes = new Hono<AppEnv>().get("/stats", requirePermission("subscription:read"), async (c) =>
  c.json({ data: await retentionStats(c.env.DB) }),
);
