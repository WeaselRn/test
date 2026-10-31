/**
 * QT-1: quotation templates and "start a quotation from a template". Owner: Person 2.
 * Quotations are subscriptions in status `quotation`; they are created through the
 * subscription service (Person 1) so lifecycle rules stay in one place.
 */
import { asc, count, eq, inArray, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { addDays, todayISO } from "../../../shared/dates";
import { idSchema, isoDateSchema, quotationTemplateSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { ApiError } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { createSubscription } from "../subscriptions/service";

const { quotationTemplates: templates, quotationTemplateLines: lines, plans, products } = schema;

async function loadTemplate(db: Database, id: string) {
  const row = await db
    .select({ t: templates, planName: plans.name })
    .from(templates)
    .innerJoin(plans, eq(plans.id, templates.planId))
    .where(eq(templates.id, id))
    .get();
  if (!row) throw ApiError.notFound("Template");
  const lineRows = await db
    .select({ l: lines, productName: products.name })
    .from(lines)
    .innerJoin(products, eq(products.id, lines.productId))
    .where(eq(lines.templateId, id))
    .orderBy(asc(lines.id));
  return {
    id: row.t.id,
    name: row.t.name,
    planId: row.t.planId,
    planName: row.planName,
    validityDays: row.t.validityDays,
    paymentTermDays: row.t.paymentTermDays,
    lines: lineRows.map((r) => ({ id: r.l.id, productId: r.l.productId, productName: r.productName, variantId: r.l.variantId, quantity: r.l.quantity })),
  };
}

export const templateRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("template:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = q.q ? like(templates.name, likeTerm(q.q)) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select({ t: templates, planName: plans.name })
        .from(templates)
        .innerJoin(plans, eq(plans.id, templates.planId))
        .where(where)
        .orderBy(asc(templates.name))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(templates).where(where).get(),
    ]);
    const ids = rows.map((r) => r.t.id);
    const lineRows = ids.length ? await db.select().from(lines).where(inArray(lines.templateId, ids)) : [];
    const data = rows.map((r) => ({
      id: r.t.id,
      name: r.t.name,
      planId: r.t.planId,
      planName: r.planName,
      validityDays: r.t.validityDays,
      paymentTermDays: r.t.paymentTermDays,
      lineCount: lineRows.filter((l) => l.templateId === r.t.id).length,
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/:id", requirePermission("template:read"), async (c) => c.json({ data: await loadTemplate(c.get("db"), c.req.param("id")) }))

  .post("/", requirePermission("template:write"), validate("json", quotationTemplateSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    await db.batch([
      db.insert(templates).values({
        id,
        name: input.name,
        planId: input.planId,
        validityDays: input.validityDays,
        paymentTermDays: input.paymentTermDays,
        createdBy: currentUser(c).id,
      }),
      ...input.lines.map((l) =>
        db.insert(lines).values({ id: newId(), templateId: id, productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity }),
      ),
      auditEntry(db, { actorId: currentUser(c).id, action: "template.created", entity: "quotation_template", entityId: id }),
    ]);
    return c.json({ data: await loadTemplate(db, id) }, 201);
  })

  .patch("/:id", requirePermission("template:write"), validate("json", quotationTemplateSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    await loadTemplate(db, id);
    await db.batch([
      db
        .update(templates)
        .set({ name: input.name, planId: input.planId, validityDays: input.validityDays, paymentTermDays: input.paymentTermDays, updatedAt: nowISO() })
        .where(eq(templates.id, id)),
      db.delete(lines).where(eq(lines.templateId, id)),
      ...input.lines.map((l) =>
        db.insert(lines).values({ id: newId(), templateId: id, productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity }),
      ),
    ]);
    return c.json({ data: await loadTemplate(db, id) });
  })

  .delete("/:id", requirePermission("template:write"), async (c) => {
    await c.get("db").delete(templates).where(eq(templates.id, c.req.param("id")));
    return c.body(null, 204);
  });

const fromTemplateSchema = z.object({
  customerId: idSchema,
  startDate: isoDateSchema,
  expiryDate: isoDateSchema.nullable().optional(),
});

/** Mounted under /subscriptions: POST /subscriptions/from-template/:templateId */
export const quotationRoutes = new Hono<AppEnv>().post(
  "/from-template/:templateId",
  requirePermission("subscription:write"),
  validate("json", fromTemplateSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const tpl = await loadTemplate(db, c.req.param("templateId"));
    const today = todayISO();
    const data = await createSubscription(
      db,
      c.env.DB,
      {
        customerId: input.customerId,
        planId: tpl.planId,
        startDate: input.startDate,
        expiryDate: input.expiryDate ?? null,
        paymentTermDays: tpl.paymentTermDays,
        lines: tpl.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
      },
      currentUser(c).id,
      { status: "quotation", templateId: tpl.id, quoteValidUntil: addDays(today, tpl.validityDays) },
    );
    return c.json({ data }, 201);
  },
);
