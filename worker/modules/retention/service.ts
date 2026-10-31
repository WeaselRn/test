/**
 * Smart Cancellation & Retention. Owner: Person 4.
 * Ask for a reason, show one fair alternative, and always let the customer cancel.
 */
import { and, asc, desc, eq, gt, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { newId, nowISO, schema, type Database } from "../../lib/db";
import { ApiError } from "../../lib/errors";
import { activityEntry } from "../../lib/events";
import { notifyInApp } from "../../lib/notifications";
import { all } from "../../lib/sql";
import { transitionSubscription } from "../subscriptions/service";

export const CANCELLATION_REASONS = ["too_expensive", "temporary", "missing_features", "not_using", "other"] as const;

export const cancellationRequestSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const resolveSchema = z.object({ decision: z.enum(["accept_alternative", "cancel", "keep"]) });

export interface Alternative {
  type: "pause" | "plan";
  label: string;
  description: string;
  planId?: string;
}

const { subscriptions, plans, cancellationRequests } = schema;

async function findAlternative(db: Database, subscriptionId: string, reason: (typeof CANCELLATION_REASONS)[number]): Promise<Alternative | null> {
  const row = await db
    .select({ s: subscriptions, p: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, subscriptionId))
    .get();
  if (!row) throw ApiError.notFound("Subscription");
  const { p } = row;
  const samePeriod = and(eq(plans.status, "active"), eq(plans.billingPeriod, p.billingPeriod), ne(plans.id, p.id));

  if (reason === "temporary") {
    return p.pausable && row.s.status === "active"
      ? { type: "pause", label: "Pause instead", description: "Keep your account and data. You are not billed while paused, and you can resume any time." }
      : null;
  }
  if (reason === "too_expensive" || reason === "not_using") {
    const cheaper = await db.select().from(plans).where(and(samePeriod, lt(plans.price, p.price))).orderBy(desc(plans.price)).get();
    return cheaper
      ? {
          type: "plan",
          planId: cheaper.id,
          label: `Switch to ${cheaper.name}`,
          description: `${fromMinor(cheaper.price)} per ${p.billingPeriod.replace("ly", "")} instead of ${fromMinor(p.price)}. A teammate will prepare the change for you.`,
        }
      : null;
  }
  if (reason === "missing_features") {
    const higher = await db.select().from(plans).where(and(samePeriod, gt(plans.price, p.price))).orderBy(asc(plans.price)).get();
    return higher
      ? { type: "plan", planId: higher.id, label: `Upgrade to ${higher.name}`, description: "Includes more capacity. A teammate will contact you to set it up." }
      : null;
  }
  return null;
}

export async function requestCancellation(
  db: Database,
  subscriptionId: string,
  customerId: string,
  input: z.infer<typeof cancellationRequestSchema>,
  actorId: string,
) {
  const sub = await db.select().from(subscriptions).where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.customerId, customerId))).get();
  if (!sub) throw ApiError.notFound("Subscription");
  if (!["active", "paused"].includes(sub.status)) throw new ApiError("invalid_transition", "Only active or paused subscriptions can be cancelled.");
  const alternative = await findAlternative(db, subscriptionId, input.reason);
  const id = newId();
  await db.batch([
    db.insert(cancellationRequests).values({
      id,
      subscriptionId,
      customerId,
      reason: input.reason,
      comment: input.comment ?? null,
      offeredAlternative: alternative ? (alternative.type === "pause" ? "pause" : `plan:${alternative.planId}`) : null,
    }),
    activityEntry(db, {
      customerId,
      type: "cancellation.requested",
      summary: `Cancellation requested for ${sub.number}: ${input.reason.replace("_", " ")}`,
      actorId,
      entity: "subscription",
      entityId: subscriptionId,
    }),
  ]);
  return { requestId: id, alternative };
}

export async function resolveCancellation(db: Database, requestId: string, customerId: string, decision: z.infer<typeof resolveSchema>["decision"], actorId: string) {
  const req = await db
    .select()
    .from(cancellationRequests)
    .where(and(eq(cancellationRequests.id, requestId), eq(cancellationRequests.customerId, customerId)))
    .get();
  if (!req) throw ApiError.notFound("Cancellation request");
  if (req.outcome !== "pending") throw ApiError.conflict("This request was already resolved.");
  let message: string;

  if (decision === "cancel") {
    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, req.subscriptionId)).get();
    const plan = sub ? await db.select().from(plans).where(eq(plans.id, sub.planId)).get() : null;
    if (plan?.closable || sub?.status === "paused") {
      await transitionSubscription(db, req.subscriptionId, "closed", actorId, `Cancelled by customer (${req.reason.replace("_", " ")})`);
      message = "Your subscription is cancelled. No further invoices will be issued.";
    } else {
      // Plan does not allow early closure: record the cancellation so it ends at expiry, and tell staff.
      await db.update(subscriptions).set({ closedReason: "Cancellation requested; ends at expiry", updatedAt: nowISO() }).where(eq(subscriptions.id, req.subscriptionId));
      await notifyStaff(db, `Cancellation at term end requested for subscription ${sub?.number}`);
      message = "Your cancellation is recorded. Your plan has a fixed term, so it ends on its expiry date and will not renew.";
    }
    await db.update(cancellationRequests).set({ outcome: "cancelled", resolvedAt: nowISO() }).where(eq(cancellationRequests.id, requestId));
  } else if (decision === "accept_alternative") {
    if (req.offeredAlternative === "pause") {
      await transitionSubscription(db, req.subscriptionId, "paused", actorId, "Paused instead of cancelling");
      message = "Your subscription is paused. Resume it any time from your portal.";
    } else {
      await notifyStaff(db, `Customer accepted a plan change (${req.offeredAlternative}) instead of cancelling.`);
      message = "Thanks for staying. A teammate will prepare the plan change and send you a quotation.";
    }
    await db.update(cancellationRequests).set({ outcome: "accepted_alternative", resolvedAt: nowISO() }).where(eq(cancellationRequests.id, requestId));
  } else {
    await db.delete(cancellationRequests).where(eq(cancellationRequests.id, requestId));
    message = "Nothing changed. Your subscription continues.";
  }
  return { message };
}

async function notifyStaff(db: Database, subject: string) {
  const staff = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(ne(schema.users.role, "customer"));
  for (const s of staff) await notifyInApp(db, { userId: s.id, recipient: s.email, subject, body: subject, entity: "retention" });
}

export async function retentionStats(d1: D1Database) {
  const [byReason, recent] = await Promise.all([
    all<{ reason: string; total: number; retained: number; cancelled: number; offered: number }>(
      d1,
      `SELECT reason, COUNT(*) AS total,
              COUNT(CASE WHEN outcome = 'accepted_alternative' THEN 1 END) AS retained,
              COUNT(CASE WHEN outcome = 'cancelled' THEN 1 END) AS cancelled,
              COUNT(CASE WHEN offered_alternative IS NOT NULL THEN 1 END) AS offered
       FROM cancellation_requests GROUP BY reason ORDER BY total DESC`,
    ),
    all<{ id: string; reason: string; outcome: string; offered_alternative: string | null; comment: string | null; created_at: string; number: string; customer: string }>(
      d1,
      `SELECT r.id, r.reason, r.outcome, r.offered_alternative, r.comment, r.created_at, s.number, COALESCE(c.company_name, c.contact_name) AS customer
       FROM cancellation_requests r JOIN subscriptions s ON s.id = r.subscription_id JOIN customers c ON c.id = r.customer_id
       ORDER BY r.created_at DESC LIMIT 25`,
    ),
  ]);
  const total = byReason.reduce((a, r) => a + r.total, 0);
  const offered = byReason.reduce((a, r) => a + r.offered, 0);
  const retained = byReason.reduce((a, r) => a + r.retained, 0);
  return {
    requests: total,
    retained,
    cancelled: byReason.reduce((a, r) => a + r.cancelled, 0),
    retentionRate: offered ? Math.round((retained / offered) * 100) : 0,
    byReason,
    recent: recent.map((r) => ({
      id: r.id,
      reason: r.reason,
      outcome: r.outcome,
      offeredAlternative: r.offered_alternative,
      comment: r.comment,
      createdAt: r.created_at,
      subscriptionNumber: r.number,
      customerName: r.customer,
    })),
    asOf: todayISO(),
  };
}
