/**
 * Customer directory, Customer 360° profile, timeline, notes and health. Owner: Person 4.
 */
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { fromMinor } from "../../../shared/money";
import { customerSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { newId, nowISO, schema } from "../../lib/db";
import { toCustomer } from "../../lib/dto";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import { activityEntry } from "../../lib/events";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { first, likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { computeHealth } from "./health";

const { customers, customerActivity, customerNotes, users } = schema;

const healthListSchema = listQuerySchema.extend({ category: z.enum(["healthy", "needs_attention", "at_risk"]).optional() });

export const customerRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("customer:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = q.q
      ? or(sql`${customers.companyName} like ${likeTerm(q.q)}`, sql`${customers.contactName} like ${likeTerm(q.q)}`, sql`${customers.email} like ${likeTerm(q.q)}`)
      : undefined;
    const activeSubs = sql<number>`(select count(*) from subscriptions s where s.customer_id = ${customers.id} and s.status = 'active')`;
    const outstanding = sql<number>`(select coalesce(sum(i.total - i.amount_paid), 0) from invoices i where i.customer_id = ${customers.id} and i.status = 'confirmed')`;
    const [rows, total] = await Promise.all([
      db
        .select({ c: customers, activeSubs, outstanding })
        .from(customers)
        .where(where)
        .orderBy(orderBy(q.sort, { contactName: customers.contactName, companyName: customers.companyName, createdAt: customers.createdAt }, desc(customers.createdAt)))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(customers).where(where).get(),
    ]);
    const data = rows.map((r) => ({ ...toCustomer(r.c), activeSubscriptions: r.activeSubs, outstanding: fromMinor(r.outstanding), hasPortalAccess: !!r.c.userId }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/health", requirePermission("customer:read"), validate("query", healthListSchema), async (c) => {
    const q = c.req.valid("query");
    const all = (await computeHealth(c.env.DB)).sort((a, b) => a.score - b.score);
    const filtered = q.category ? all.filter((h) => h.category === q.category) : all;
    const start = (q.page - 1) * q.pageSize;
    return c.json({
      ...paginated(filtered.slice(start, start + q.pageSize), q, filtered.length),
      counts: {
        healthy: all.filter((h) => h.category === "healthy").length,
        needs_attention: all.filter((h) => h.category === "needs_attention").length,
        at_risk: all.filter((h) => h.category === "at_risk").length,
      },
    });
  })

  .post("/", requirePermission("customer:write"), validate("json", customerSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    // Link to an existing customer login with the same email (customer signed up first).
    const user = await db.select({ id: users.id }).from(users).where(and(eq(users.email, input.email), eq(users.role, "customer"))).get();
    try {
      await db.batch([
        db.insert(customers).values({ id, userId: user?.id ?? null, ...input }),
        activityEntry(db, { customerId: id, type: "customer.created", summary: `Customer created by ${currentUser(c).name}`, actorId: currentUser(c).id }),
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw ApiError.conflict("A customer with this email already exists.", { email: "Already exists" });
      throw err;
    }
    const row = await db.select().from(customers).where(eq(customers.id, id)).get();
    return c.json({ data: toCustomer(row!) }, 201);
  })

  .get("/:id", requirePermission("customer:read"), async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const row = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!row) throw ApiError.notFound("Customer");
    const [stats, health] = await Promise.all([
      first<{ active: number; total_paid: number; outstanding: number; last_payment: string | null; lifetime_billed: number }>(
        c.env.DB,
        `SELECT (SELECT COUNT(*) FROM subscriptions WHERE customer_id = ?1 AND status = 'active') AS active,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = ?1) AS total_paid,
                (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE customer_id = ?1 AND status = 'confirmed') AS outstanding,
                (SELECT MAX(paid_on) FROM payments WHERE customer_id = ?1) AS last_payment,
                (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE customer_id = ?1 AND status != 'cancelled') AS lifetime_billed`,
        id,
      ),
      computeHealth(c.env.DB, id),
    ]);
    return c.json({
      data: {
        ...toCustomer(row),
        hasPortalAccess: !!row.userId,
        stats: {
          activeSubscriptions: stats?.active ?? 0,
          totalPaid: fromMinor(stats?.total_paid ?? 0),
          outstanding: fromMinor(stats?.outstanding ?? 0),
          lifetimeBilled: fromMinor(stats?.lifetime_billed ?? 0),
          lastPayment: stats?.last_payment ?? null,
        },
        health: health[0] ?? null,
      },
    });
  })

  .patch("/:id", requirePermission("customer:write"), validate("json", customerSchema), async (c) => {
    const res = await c
      .get("db")
      .update(customers)
      .set({ ...c.req.valid("json"), updatedAt: nowISO() })
      .where(eq(customers.id, c.req.param("id")))
      .returning();
    if (!res[0]) throw ApiError.notFound("Customer");
    return c.json({ data: toCustomer(res[0]) });
  })

  .get("/:id/timeline", requirePermission("customer:read"), validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = eq(customerActivity.customerId, c.req.param("id"));
    const [rows, total] = await Promise.all([
      db
        .select({ a: customerActivity, actorName: users.name })
        .from(customerActivity)
        .leftJoin(users, eq(users.id, customerActivity.actorId))
        .where(where)
        .orderBy(desc(customerActivity.createdAt))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(customerActivity).where(where).get(),
    ]);
    const data = rows.map((r) => ({ ...r.a, actorName: r.actorName ?? (r.a.actorId ? null : "System") }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .get("/:id/notes", requirePermission("customer:read"), async (c) => {
    const rows = await c
      .get("db")
      .select({ n: customerNotes, authorName: users.name })
      .from(customerNotes)
      .leftJoin(users, eq(users.id, customerNotes.authorId))
      .where(eq(customerNotes.customerId, c.req.param("id")))
      .orderBy(desc(customerNotes.createdAt))
      .limit(50);
    return c.json({ data: rows.map((r) => ({ ...r.n, authorName: r.authorName })) });
  })

  .post("/:id/notes", requirePermission("customer:write"), validate("json", z.object({ body: z.string().trim().min(1).max(2000) })), async (c) => {
    const db = c.get("db");
    const customerId = c.req.param("id");
    const user = currentUser(c);
    await db.batch([
      db.insert(customerNotes).values({ id: newId(), customerId, authorId: user.id, body: c.req.valid("json").body }),
      activityEntry(db, { customerId, type: "note.added", summary: `${user.name} added a note`, actorId: user.id }),
    ]);
    return c.json({ ok: true }, 201);
  });
