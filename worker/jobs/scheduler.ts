/**
 * Daily scheduler (Cloudflare Cron Trigger, see wrangler.jsonc). Owner: Person 1.
 *
 * Modules never create their own cron triggers: they register a job here. Jobs run
 * in order; one failing job is logged and does not stop the others. Every job must
 * be idempotent, because a cron can fire twice and an admin can run jobs manually.
 */
import { lt } from "drizzle-orm";
import { createDb, schema, type Database } from "../lib/db";
import { activateConfirmedJob, billingRunJob, planAutoCloseJob } from "../modules/billing/jobs";
import { runDunning } from "../modules/dunning/service";
import { scanInvoiceAnomalies, scanRevenueLeakage } from "../modules/finance/detection";
import { scanRenewals } from "../modules/renewals/service";

export interface JobContext {
  db: Database;
  env: Env;
  /** Business date for this run (YYYY-MM-DD, UTC). */
  today: string;
}

export interface ScheduledJob {
  name: string;
  run(ctx: JobContext): Promise<Record<string, unknown> | void>;
}

/**
 * Order matters: billing first (needs Active subscriptions), then plan auto-close,
 * then overdue/dunning, renewals and detection, which read the invoices billing made.
 * Module owners append their job here in their PR.
 */
export const jobs: ScheduledJob[] = [
  activateConfirmedJob, // Person 1
  billingRunJob, // Person 1
  planAutoCloseJob, // Person 1
  { name: "dunning", run: runDunning }, // Person 4
  { name: "renewals", run: scanRenewals }, // Person 4
  { name: "revenue-leakage", run: scanRevenueLeakage }, // Person 3
  { name: "invoice-anomalies", run: scanInvoiceAnomalies }, // Person 3
  {
    name: "cleanup-expired-sessions",
    async run({ db }) {
      const now = new Date().toISOString();
      await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now));
      await db.delete(schema.passwordResetTokens).where(lt(schema.passwordResetTokens.expiresAt, now));
    },
  },
];

export async function runScheduledJobs(env: Env, now = new Date()): Promise<Record<string, unknown>> {
  const ctx: JobContext = { db: createDb(env.DB), env, today: now.toISOString().slice(0, 10) };
  const results: Record<string, unknown> = {};
  for (const job of jobs) {
    try {
      results[job.name] = (await job.run(ctx)) ?? "ok";
    } catch (err) {
      console.error(`Scheduled job ${job.name} failed`, err);
      results[job.name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  console.log("Scheduled jobs finished", JSON.stringify(results));
  return results;
}
