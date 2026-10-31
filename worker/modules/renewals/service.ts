/**
 * Smart Renewal Management. Owner: Person 4.
 * A daily job opens a renewal task for every renewable subscription nearing expiry and
 * keeps task status in step with what happened (quoted, renewed, expired).
 */
import { addDays } from "../../../shared/dates";
import type { JobContext } from "../../jobs/scheduler";
import { newId, type Database } from "../../lib/db";
import { notifyInApp } from "../../lib/notifications";
import { getSetting } from "../../lib/settings";
import { all } from "../../lib/sql";
import { createRenewalQuotation } from "../subscriptions/service";

export async function scanRenewals({ db, env, today }: JobContext) {
  const reminderDays = await getSetting<number[]>(db, "renewals.reminderDays", [30, 7]);
  const horizon = addDays(today, Math.max(...reminderDays, 7));
  const due = await all<{ id: string; number: string; expiry_date: string }>(
    env.DB,
    `SELECT s.id, s.number, s.expiry_date FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.status IN ('active','paused') AND p.renewable = 1 AND s.expiry_date IS NOT NULL AND s.expiry_date BETWEEN ?1 AND ?2
       AND NOT EXISTS (SELECT 1 FROM renewal_tasks t WHERE t.subscription_id = s.id)`,
    today,
    horizon,
  );
  const stmt = env.DB.prepare(`INSERT OR IGNORE INTO renewal_tasks (id, subscription_id, due_on, status) VALUES (?1, ?2, ?3, 'open')`);
  if (due.length) await env.DB.batch(due.map((s) => stmt.bind(newId(), s.id, s.expiry_date)));

  // Keep task status in step with the subscriptions.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE renewal_tasks SET status = 'renewed', updated_at = ?1
       WHERE status IN ('open','quoted') AND renewal_subscription_id IN (SELECT id FROM subscriptions WHERE status IN ('confirmed','active'))`,
    ).bind(new Date().toISOString()),
    env.DB.prepare(
      `UPDATE renewal_tasks SET status = 'expired', updated_at = ?1
       WHERE status IN ('open','quoted') AND subscription_id IN (SELECT id FROM subscriptions WHERE status = 'closed')`,
    ).bind(new Date().toISOString()),
  ]);

  if (due.length) {
    const staff = await all<{ id: string; email: string }>(env.DB, `SELECT id, email FROM users WHERE role IN ('admin','staff') AND is_active = 1`);
    for (const s of staff) {
      await notifyInApp(db, {
        userId: s.id,
        recipient: s.email,
        subject: `${due.length} subscription${due.length > 1 ? "s" : ""} need a renewal decision`,
        body: due.map((d) => `${d.number} expires ${d.expiry_date}`).join("\n"),
        entity: "renewal",
      });
    }
  }
  return { created: due.length };
}

/** Create the renewal quotation for a task and mark it quoted. */
export async function quoteRenewal(db: Database, d1: D1Database, taskId: string, actorId: string | null) {
  const task = await d1.prepare(`SELECT * FROM renewal_tasks WHERE id = ?1`).bind(taskId).first<{ id: string; subscription_id: string }>();
  if (!task) return null;
  const quotation = await createRenewalQuotation(db, d1, task.subscription_id, actorId);
  await d1
    .prepare(`UPDATE renewal_tasks SET status = 'quoted', renewal_subscription_id = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(quotation.id, new Date().toISOString(), taskId)
    .run();
  await d1
    .prepare(`INSERT INTO customer_activity (id, customer_id, type, entity, entity_id, summary, actor_id) VALUES (?1, ?2, 'renewal.created', 'subscription', ?3, ?4, ?5)`)
    .bind(newId(), quotation.customerId, quotation.id, `Renewal quotation ${quotation.number} prepared`, actorId)
    .run();
  return quotation;
}
