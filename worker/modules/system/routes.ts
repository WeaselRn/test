/**
 * Platform endpoints: health check and the signed-in user's notifications (outbox).
 * Owner: Person 1 (core backend).
 */
import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser, requireAuth, requirePermission } from "../../lib/auth";
import { schema } from "../../lib/db";

export const systemRoutes = new Hono<AppEnv>()
  .get("/health", async (c) => {
    const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return c.json({ status: "ok", database: row?.ok === 1 ? "ok" : "unavailable", time: new Date().toISOString() });
  })

  .get("/notifications", requireAuth, async (c) => {
    const user = currentUser(c);
    const { notifications: n } = schema;
    const rows = await c
      .get("db")
      .select()
      .from(n)
      .where(or(eq(n.userId, user.id), and(eq(n.channel, "email"), eq(n.recipient, user.email))))
      .orderBy(desc(n.createdAt))
      .limit(50);
    return c.json({ data: rows });
  })

  /** Simulated email outbox for demos: admins and staff can read every message. */
  .get("/outbox", requirePermission("customer:read"), async (c) => {
    const { notifications: n } = schema;
    const rows = await c.get("db").select().from(n).where(eq(n.channel, "email")).orderBy(desc(n.createdAt)).limit(100);
    return c.json({ data: rows });
  });
