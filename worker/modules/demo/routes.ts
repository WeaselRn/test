/** POST /demo/load — loads the demo scenario (admin, demo mode only). Owner: Person 4. */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser, requireRole } from "../../lib/auth";
import { loadDemoData } from "./service";

export const demoRoutes = new Hono<AppEnv>().post("/load", requireRole("admin"), async (c) =>
  c.json({ data: await loadDemoData(c.get("db"), c.env, currentUser(c).id) }),
);
