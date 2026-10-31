/**
 * PLAN-1, PLAN-2: subscription plans and their lifecycle switches. Owner: Person 2.
 * Read: admin + staff. Write: admin only.
 */
import { and, asc, count, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { toMinor } from "../../../shared/money";
import { planSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema } from "../../lib/db";
import { toPlan } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";

const { plans } = schema;

const listSchema = listQuerySchema.extend({ status: z.enum(["active", "closed"]).optional() });

function planValues(input: z.infer<typeof planSchema>) {
  return {
    name: input.name,
    price: toMinor(input.price),
    billingPeriod: input.billingPeriod,
    minQuantity: input.minQuantity,
    availableFrom: input.availableFrom,
    availableTo: input.availableTo ?? null,
    autoClose: input.autoClose,
    closable: input.closable,
    pausable: input.pausable,
    renewable: input.renewable,
  };
}

export const planRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("catalog:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = and(q.q ? like(plans.name, likeTerm(q.q)) : undefined, q.status ? eq(plans.status, q.status) : undefined);
    const activeSubs = sql<number>`(select count(*) from subscriptions s where s.plan_id = ${plans.id} and s.status in ('active','paused'))`;
    const [rows, total] = await Promise.all([
      db
        .select({ p: plans, activeSubs })
        .from(plans)
        .where(where)
        .orderBy(orderBy(q.sort, { name: plans.name, price: plans.price, createdAt: plans.createdAt }, asc(plans.name)))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(plans).where(where).get(),
    ]);
    return c.json(paginated(rows.map((r) => ({ ...toPlan(r.p), activeSubscriptions: r.activeSubs })), q, total?.n ?? 0));
  })

  .get("/:id", requirePermission("catalog:read"), async (c) => {
    const row = await c.get("db").select().from(plans).where(eq(plans.id, c.req.param("id"))).get();
    if (!row) throw ApiError.notFound("Plan");
    return c.json({ data: toPlan(row) });
  })

  .post("/", requirePermission("catalog:write"), validate("json", planSchema), async (c) => {
    const db = c.get("db");
    const id = newId();
    await db.batch([
      db.insert(plans).values({ id, ...planValues(c.req.valid("json")) }),
      auditEntry(db, { actorId: currentUser(c).id, action: "plan.created", entity: "plan", entityId: id }),
    ]);
    const row = await db.select().from(plans).where(eq(plans.id, id)).get();
    return c.json({ data: toPlan(row!) }, 201);
  })

  .patch("/:id", requirePermission("catalog:write"), validate("json", planSchema), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const res = await db
      .update(plans)
      .set({ ...planValues(c.req.valid("json")), updatedAt: nowISO() })
      .where(eq(plans.id, id))
      .returning();
    if (!res[0]) throw ApiError.notFound("Plan");
    await auditEntry(db, { actorId: currentUser(c).id, action: "plan.updated", entity: "plan", entityId: id });
    return c.json({ data: toPlan(res[0]) });
  })

  /** Close a plan for new sales. Existing subscriptions continue unless auto-close applies. */
  .post("/:id/close", requirePermission("catalog:write"), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const res = await db.update(plans).set({ status: "closed", updatedAt: nowISO() }).where(eq(plans.id, id)).returning();
    if (!res[0]) throw ApiError.notFound("Plan");
    await auditEntry(db, { actorId: currentUser(c).id, action: "plan.closed", entity: "plan", entityId: id });
    return c.json({ data: toPlan(res[0]) });
  })

  .post("/:id/reopen", requirePermission("catalog:write"), async (c) => {
    const id = c.req.param("id");
    const res = await c.get("db").update(plans).set({ status: "active", updatedAt: nowISO() }).where(eq(plans.id, id)).returning();
    if (!res[0]) throw ApiError.notFound("Plan");
    return c.json({ data: toPlan(res[0]) });
  });
