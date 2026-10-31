/**
 * DISC-1, DISC-2: discount rules. Owner: Person 2. Application to invoices (DISC-3)
 * happens in the billing run through shared/pricing.ts.
 * Read: admin + staff. Write: admin only.
 */
import { and, asc, count, eq, inArray, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { todayISO } from "../../../shared/dates";
import { toBasisPoints, toMinor } from "../../../shared/money";
import { discountSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { toDiscount } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";

const { discounts, discountProducts } = schema;

const listSchema = listQuerySchema.extend({ state: z.enum(["live", "expired", "exhausted"]).optional() });

function values(input: z.infer<typeof discountSchema>) {
  return {
    name: input.name,
    kind: input.kind,
    value: input.kind === "percentage" ? toBasisPoints(input.value) : toMinor(input.value),
    minPurchase: toMinor(input.minPurchase),
    minQuantity: input.minQuantity,
    startsOn: input.startsOn,
    endsOn: input.endsOn ?? null,
    usageLimit: input.usageLimit ?? null,
    scope: input.scope,
    isActive: input.isActive,
  };
}

async function productIdsFor(db: Database, ids: string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const rows = await db.select().from(discountProducts).where(inArray(discountProducts.discountId, ids));
  for (const r of rows) map.set(r.discountId, [...(map.get(r.discountId) ?? []), r.productId]);
  return map;
}

async function load(db: Database, id: string) {
  const row = await db.select().from(discounts).where(eq(discounts.id, id)).get();
  if (!row) throw ApiError.notFound("Discount");
  return toDiscount(row, (await productIdsFor(db, [id])).get(id) ?? []);
}

export const discountRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("discount:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = and(q.q ? like(discounts.name, likeTerm(q.q)) : undefined);
    const [rows, total] = await Promise.all([
      db.select().from(discounts).where(where).orderBy(asc(discounts.name)).limit(pageOffset(q).limit).offset(pageOffset(q).offset),
      db.select({ n: count() }).from(discounts).where(where).get(),
    ]);
    const products = await productIdsFor(db, rows.map((r) => r.id));
    const today = todayISO();
    const data = rows.map((r) => ({
      ...toDiscount(r, products.get(r.id) ?? []),
      state:
        r.usageLimit !== null && r.usageCount >= r.usageLimit
          ? "exhausted"
          : r.endsOn && r.endsOn < today
            ? "expired"
            : r.startsOn > today
              ? "scheduled"
              : r.isActive
                ? "live"
                : "inactive",
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/:id", requirePermission("discount:read"), async (c) => c.json({ data: await load(c.get("db"), c.req.param("id")) }))

  .post("/", requirePermission("discount:write"), validate("json", discountSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    await db.batch([
      db.insert(discounts).values({ id, ...values(input) }),
      ...(input.scope === "product" ? input.productIds.map((productId) => db.insert(discountProducts).values({ discountId: id, productId })) : []),
      auditEntry(db, { actorId: currentUser(c).id, action: "discount.created", entity: "discount", entityId: id }),
    ]);
    return c.json({ data: await load(db, id) }, 201);
  })

  .patch("/:id", requirePermission("discount:write"), validate("json", discountSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    await load(db, id);
    await db.batch([
      db.update(discounts).set({ ...values(input), updatedAt: nowISO() }).where(eq(discounts.id, id)),
      db.delete(discountProducts).where(eq(discountProducts.discountId, id)),
      ...(input.scope === "product" ? input.productIds.map((productId) => db.insert(discountProducts).values({ discountId: id, productId })) : []),
      auditEntry(db, { actorId: currentUser(c).id, action: "discount.updated", entity: "discount", entityId: id }),
    ]);
    return c.json({ data: await load(db, id) });
  })

  .delete("/:id", requirePermission("discount:write"), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const used = await db.select({ n: count() }).from(schema.discountRedemptions).where(eq(schema.discountRedemptions.discountId, id)).get();
    if (used && used.n > 0) throw ApiError.conflict("This discount has been used on invoices. Deactivate it instead.");
    await db.delete(discounts).where(eq(discounts.id, id));
    return c.body(null, 204);
  });
