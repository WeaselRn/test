/**
 * SUB-1..3: subscriptions list, detail, lifecycle actions. Owner: Person 1.
 */
import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema } from "../../../shared/api";
import { SUBSCRIPTION_STATUSES } from "../../../shared/lifecycle";
import { fromMinor } from "../../../shared/money";
import { subscriptionSchema, subscriptionTransitionSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { schema } from "../../lib/db";
import { customerLabel, toSubscription } from "../../lib/dto";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { likeTerm } from "../../lib/sql";
import { validate } from "../../lib/validate";
import {
  createRenewalQuotation,
  createSubscription,
  getSubscription,
  getSubscriptionHistory,
  getSubscriptionInvoices,
  transitionSubscription,
  updateSubscription,
} from "./service";

const { subscriptions, customers, plans } = schema;

const listSchema = listQuerySchema.extend({
  status: z.string().optional(), // comma-separated statuses
  customerId: z.string().optional(),
  planId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const subscriptionRoutes = new Hono<AppEnv>()
  .get("/", requirePermission("subscription:read"), validate("query", listSchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const statuses = (q.status ?? "").split(",").filter((s): s is (typeof SUBSCRIPTION_STATUSES)[number] =>
      (SUBSCRIPTION_STATUSES as readonly string[]).includes(s),
    );
    const where = and(
      statuses.length ? inArray(subscriptions.status, statuses) : undefined,
      q.customerId ? eq(subscriptions.customerId, q.customerId) : undefined,
      q.planId ? eq(subscriptions.planId, q.planId) : undefined,
      q.from ? gte(subscriptions.startDate, q.from) : undefined,
      q.to ? lte(subscriptions.startDate, q.to) : undefined,
      q.q
        ? or(
            sql`${subscriptions.number} like ${likeTerm(q.q)}`,
            sql`${customers.companyName} like ${likeTerm(q.q)}`,
            sql`${customers.contactName} like ${likeTerm(q.q)}`,
          )
        : undefined,
    );
    const [rows, total] = await Promise.all([
      db
        .select({ s: subscriptions, c: customers, planName: plans.name, billingPeriod: plans.billingPeriod, planPrice: plans.price })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(where)
        .orderBy(
          orderBy(
            q.sort,
            { number: subscriptions.number, startDate: subscriptions.startDate, nextInvoiceDate: subscriptions.nextInvoiceDate, createdAt: subscriptions.createdAt },
            desc(subscriptions.createdAt),
          ),
        )
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db
        .select({ n: count() })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .where(where)
        .get(),
    ]);
    // Line totals for this page only (a correlated subquery would run for every row before the sort).
    const ids = rows.map((r) => r.s.id);
    const lineTotals = ids.length
      ? await db
          .select({ id: schema.subscriptionLines.subscriptionId, total: sql<number>`sum(${schema.subscriptionLines.amount})` })
          .from(schema.subscriptionLines)
          .where(inArray(schema.subscriptionLines.subscriptionId, ids))
          .groupBy(schema.subscriptionLines.subscriptionId)
      : [];
    const data = rows.map((r) => ({
      ...toSubscription(r.s, { customerName: customerLabel(r.c), planName: r.planName }),
      billingPeriod: r.billingPeriod,
      recurringTotal: fromMinor(r.planPrice + (lineTotals.find((l) => l.id === r.s.id)?.total ?? 0)),
    }));
    return c.json(paginated(data, q, total?.n ?? 0));
  })

  .post("/", requirePermission("subscription:write"), validate("json", subscriptionSchema), async (c) => {
    const data = await createSubscription(c.get("db"), c.env.DB, c.req.valid("json"), currentUser(c).id);
    return c.json({ data }, 201);
  })

  .get("/:id", requirePermission("subscription:read"), async (c) => c.json({ data: await getSubscription(c.get("db"), c.req.param("id")) }))

  .patch("/:id", requirePermission("subscription:write"), validate("json", subscriptionSchema), async (c) => {
    const data = await updateSubscription(c.get("db"), c.req.param("id"), c.req.valid("json"), currentUser(c).id);
    return c.json({ data });
  })

  .post("/:id/transition", requirePermission("subscription:write"), validate("json", subscriptionTransitionSchema), async (c) => {
    const { to, note } = c.req.valid("json");
    const data = await transitionSubscription(c.get("db"), c.req.param("id"), to, currentUser(c).id, note);
    return c.json({ data });
  })

  .post("/:id/renew", requirePermission("subscription:write"), async (c) => {
    const data = await createRenewalQuotation(c.get("db"), c.env.DB, c.req.param("id"), currentUser(c).id);
    return c.json({ data }, 201);
  })

  .get("/:id/history", requirePermission("subscription:read"), async (c) =>
    c.json({ data: await getSubscriptionHistory(c.get("db"), c.req.param("id")) }),
  )

  .get("/:id/invoices", requirePermission("subscription:read"), async (c) =>
    c.json({ data: await getSubscriptionInvoices(c.get("db"), c.req.param("id")) }),
  );
