/**
 * Daily lifecycle jobs. Owner: Person 1. Registered in worker/jobs/scheduler.ts.
 */
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { schema } from "../../lib/db";
import type { ScheduledJob } from "../../jobs/scheduler";
import { transitionSubscription } from "../subscriptions/service";
import { runBilling } from "./service";

const { subscriptions, plans } = schema;

export const activateConfirmedJob: ScheduledJob = {
  name: "activate-confirmed",
  async run({ db, today }) {
    const due = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, "confirmed"), lte(subscriptions.startDate, today)));
    for (const s of due) await transitionSubscription(db, s.id, "active", null, "Start date reached", today);
    return { activated: due.length };
  },
};

export const billingRunJob: ScheduledJob = {
  name: "billing-run",
  async run({ db, env, today }) {
    const r = await runBilling(db, env.DB, { today, trigger: "cron" });
    return { created: r.created, skipped: r.skipped, failed: r.failed };
  },
};

/** Close subscriptions whose plan ended with auto-close on, and subscriptions past expiry. */
export const planAutoCloseJob: ScheduledJob = {
  name: "plan-auto-close",
  async run({ db, today }) {
    const endedPlans = await db
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(and(eq(plans.autoClose, true), isNotNull(plans.availableTo), lt(plans.availableTo, today)));
    let closed = 0;
    if (endedPlans.length) {
      await db.update(plans).set({ status: "closed" }).where(inArray(plans.id, endedPlans.map((p) => p.id)));
      const subs = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(inArray(subscriptions.planId, endedPlans.map((p) => p.id)), inArray(subscriptions.status, ["active", "paused"])));
      for (const s of subs) {
        await transitionSubscription(db, s.id, "closed", null, "Plan ended (auto-close)", today);
        closed++;
      }
    }
    const expired = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(inArray(subscriptions.status, ["active", "paused"]), isNotNull(subscriptions.expiryDate), lt(subscriptions.expiryDate, today)));
    for (const s of expired) {
      await transitionSubscription(db, s.id, "closed", null, "Expired", today).catch(() => undefined);
      closed++;
    }
    return { plansClosed: endedPlans.length, subscriptionsClosed: closed };
  },
};
