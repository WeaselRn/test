/**
 * CAT-1, CAT-2: products and variants. Owner: Person 2.
 * Read: admin + staff. Write: admin only.
 */
import { and, asc, count, eq, inArray, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { fromMinor, toMinor } from "../../../shared/money";
import { productSchema, variantSchema } from "../../../shared/schemas";
import type { ProductVariant } from "../../../shared/types";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { toProduct } from "../../lib/dto";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";

const { products, productVariants, productTaxes } = schema;

const listSchema = listQuerySchema.extend({
  active: z.enum(["true", "false"]).optional(),
  type: z.enum(["service", "goods", "software"]).optional(),
});

function toVariant(r: typeof productVariants.$inferSelect): ProductVariant {
  return { id: r.id, productId: r.productId, attribute: r.attribute, value: r.value, extraPrice: fromMinor(r.extraPrice) };
}

async function taxIdsFor(db: Database, ids: string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const rows = await db.select().from(productTaxes).where(inArray(productTaxes.productId, ids));
  for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), r.taxId]);
  return map;
}

async function loadProduct(db: Database, id: string) {
  const row = await db.select().from(products).where(eq(products.id, id)).get();
  if (!row) throw ApiError.notFound("Product");
  const [taxes, variants] = await Promise.all([
    taxIdsFor(db, [id]),
    db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.attribute), asc(productVariants.value)),
  ]);
  return { ...toProduct(row, taxes.get(id) ?? []), variants: variants.map(toVariant) };
}

export const productRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("catalog:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = and(
      q.q ? like(products.name, likeTerm(q.q)) : undefined,
      q.active ? eq(products.isActive, q.active === "true") : undefined,
      q.type ? eq(products.type, q.type) : undefined,
    );
    const variantCount = sql<number>`(select count(*) from product_variants v where v.product_id = ${products.id})`;
    const [rows, total] = await Promise.all([
      db
        .select({ p: products, variantCount })
        .from(products)
        .where(where)
        .orderBy(orderBy(q.sort, { name: products.name, salesPrice: products.salesPrice, createdAt: products.createdAt }, asc(products.name)))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(products).where(where).get(),
    ]);
    const taxes = await taxIdsFor(db, rows.map((r) => r.p.id));
    const data = rows.map((r) => ({ ...toProduct(r.p, taxes.get(r.p.id) ?? []), variantCount: r.variantCount }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  /** Flat list of all variants (Variants page). */
  .get("/variants", requirePermission("catalog:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = q.q
      ? sql`(${productVariants.value} like ${likeTerm(q.q)} or ${productVariants.attribute} like ${likeTerm(q.q)} or ${products.name} like ${likeTerm(q.q)})`
      : undefined;
    const [rows, total] = await Promise.all([
      db
        .select({ v: productVariants, productName: products.name, salesPrice: products.salesPrice })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(where)
        .orderBy(asc(products.name), asc(productVariants.attribute))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(where).get(),
    ]);
    const data = rows.map((r) => ({
      ...toVariant(r.v),
      productName: r.productName,
      basePrice: fromMinor(r.salesPrice),
      finalPrice: fromMinor(r.salesPrice + r.v.extraPrice),
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/:id", requirePermission("catalog:read"), async (c) => c.json({ data: await loadProduct(c.get("db"), c.req.param("id")) }))

  .post("/", requirePermission("catalog:write"), validate("json", productSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    await db.batch([
      db.insert(products).values({
        id,
        name: input.name,
        type: input.type,
        salesPrice: toMinor(input.salesPrice),
        costPrice: toMinor(input.costPrice),
        notes: input.notes ?? null,
        isActive: input.isActive,
      }),
      ...input.taxIds.map((taxId) => db.insert(productTaxes).values({ productId: id, taxId })),
      auditEntry(db, { actorId: currentUser(c).id, action: "product.created", entity: "product", entityId: id }),
    ]);
    return c.json({ data: await loadProduct(db, id) }, 201);
  })

  .patch("/:id", requirePermission("catalog:write"), validate("json", productSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    await loadProduct(db, id);
    await db.batch([
      db
        .update(products)
        .set({
          name: input.name,
          type: input.type,
          salesPrice: toMinor(input.salesPrice),
          costPrice: toMinor(input.costPrice),
          notes: input.notes ?? null,
          isActive: input.isActive,
          updatedAt: nowISO(),
        })
        .where(eq(products.id, id)),
      db.delete(productTaxes).where(eq(productTaxes.productId, id)),
      ...input.taxIds.map((taxId) => db.insert(productTaxes).values({ productId: id, taxId })),
      auditEntry(db, { actorId: currentUser(c).id, action: "product.updated", entity: "product", entityId: id }),
    ]);
    return c.json({ data: await loadProduct(db, id) });
  })

  .delete("/:id", requirePermission("catalog:write"), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const used = await db
      .select({ n: count() })
      .from(schema.subscriptionLines)
      .where(eq(schema.subscriptionLines.productId, id))
      .get();
    if (used && used.n > 0) {
      throw ApiError.conflict("This product is used by subscriptions. Deactivate it instead of deleting it.");
    }
    try {
      await db.batch([
        db.delete(products).where(eq(products.id, id)),
        auditEntry(db, { actorId: currentUser(c).id, action: "product.deleted", entity: "product", entityId: id }),
      ]);
    } catch {
      throw ApiError.conflict("This product is referenced by templates or invoices. Deactivate it instead.");
    }
    return c.body(null, 204);
  })

  .post("/:id/variants", requirePermission("catalog:write"), validate("json", variantSchema), async (c) => {
    const productId = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    await loadProduct(db, productId);
    const id = newId();
    try {
      await db.insert(productVariants).values({ id, productId, attribute: input.attribute, value: input.value, extraPrice: toMinor(input.extraPrice) });
    } catch (err) {
      if (isUniqueViolation(err)) throw ApiError.conflict("This variant already exists.", { value: "Already exists for this attribute" });
      throw err;
    }
    const row = await db.select().from(productVariants).where(eq(productVariants.id, id)).get();
    return c.json({ data: toVariant(row!) }, 201);
  });

export const variantRoutes = new Hono<AppEnv>()
  .patch("/:id", requirePermission("catalog:write"), validate("json", variantSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    const res = await db
      .update(productVariants)
      .set({ attribute: input.attribute, value: input.value, extraPrice: toMinor(input.extraPrice) })
      .where(eq(productVariants.id, id))
      .returning();
    if (!res[0]) throw ApiError.notFound("Variant");
    return c.json({ data: toVariant(res[0]) });
  })
  .delete("/:id", requirePermission("catalog:write"), async (c) => {
    await c.get("db").delete(productVariants).where(eq(productVariants.id, c.req.param("id")));
    return c.body(null, 204);
  });

