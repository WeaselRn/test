/**
 * TAX-1: tax rules (percentage or fixed per unit). Owner: Person 2.
 * Read: admin + staff. Write: admin only.
 */
import { asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { listQuerySchema } from "../../../shared/api";
import { toBasisPoints, toMinor } from "../../../shared/money";
import { taxSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema } from "../../lib/db";
import { toTax } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { pageOffset, paginated } from "../../lib/pagination";
import { validate } from "../../lib/validate";

const { taxes } = schema;

const rateOf = (kind: "percentage" | "fixed", rate: string) => (kind === "percentage" ? toBasisPoints(rate) : toMinor(rate));

export const taxRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("tax:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const [rows, total] = await Promise.all([
      db.select().from(taxes).orderBy(asc(taxes.name)).limit(pageOffset(q).limit).offset(pageOffset(q).offset),
      db.select({ n: count() }).from(taxes).get(),
    ]);
    return c.json(paginated(rows.map(toTax), q, total?.n ?? 0));
  })

  .post("/", requirePermission("tax:write"), validate("json", taxSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    await db.batch([
      db.insert(taxes).values({ id, name: input.name, kind: input.kind, rate: rateOf(input.kind, input.rate), isActive: input.isActive }),
      auditEntry(db, { actorId: currentUser(c).id, action: "tax.created", entity: "tax", entityId: id }),
    ]);
    const row = await db.select().from(taxes).where(eq(taxes.id, id)).get();
    return c.json({ data: toTax(row!) }, 201);
  })

  .patch("/:id", requirePermission("tax:write"), validate("json", taxSchema), async (c) => {
    const input = c.req.valid("json");
    const res = await c
      .get("db")
      .update(taxes)
      .set({ name: input.name, kind: input.kind, rate: rateOf(input.kind, input.rate), isActive: input.isActive, updatedAt: nowISO() })
      .where(eq(taxes.id, c.req.param("id")))
      .returning();
    if (!res[0]) throw ApiError.notFound("Tax");
    return c.json({ data: toTax(res[0]) });
  })

  .delete("/:id", requirePermission("tax:write"), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const used = await db.select({ n: count() }).from(schema.subscriptionLines).where(eq(schema.subscriptionLines.taxId, id)).get();
    if (used && used.n > 0) throw ApiError.conflict("This tax is used by subscriptions. Deactivate it instead.");
    await db.delete(taxes).where(eq(taxes.id, id));
    return c.body(null, 204);
  });
