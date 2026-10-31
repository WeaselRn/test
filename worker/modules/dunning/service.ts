/**
 * Smart Dunning: payment recovery reminders for unpaid invoices. Owner: Person 4.
 * Runs as a scheduler job; sends through lib/notifications (simulated in demo mode).
 * Reminders stop automatically once an invoice is paid, because only Confirmed
 * invoices with a balance are considered.
 */
import { z } from "zod";
import { addDays, diffDays } from "../../../shared/dates";
import { newId, type Database } from "../../lib/db";
import type { JobContext } from "../../jobs/scheduler";
import { money } from "../../lib/format";
import { notifyInApp, sendEmail } from "../../lib/notifications";
import { getSetting } from "../../lib/settings";
import { all } from "../../lib/sql";

export const dunningStepSchema = z.object({
  step: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and _ only"),
  offsetDays: z.coerce.number().int().min(-30).max(120),
  action: z.enum(["remind", "remind_and_notify_staff", "escalate"]),
});
export const dunningScheduleSchema = z.array(dunningStepSchema).min(1).max(8);
export type DunningStep = z.infer<typeof dunningStepSchema>;

export const DEFAULT_SCHEDULE: DunningStep[] = [
  { step: "pre_due", offsetDays: -3, action: "remind" },
  { step: "overdue_3", offsetDays: 3, action: "remind" },
  { step: "overdue_7", offsetDays: 7, action: "remind_and_notify_staff" },
  { step: "escalate_14", offsetDays: 14, action: "escalate" },
];

export async function getSchedule(db: Database): Promise<DunningStep[]> {
  const s = await getSetting<DunningStep[]>(db, "dunning.schedule", DEFAULT_SCHEDULE);
  return [...s].sort((a, b) => a.offsetDays - b.offsetDays);
}

interface DueInvoice {
  id: string;
  number: string;
  customer_id: string;
  email: string;
  contact_name: string;
  user_id: string | null;
  due_date: string;
  balance: number;
  sent_steps: string | null;
}

function message(step: DunningStep, inv: DueInvoice, today: string, appUrl: string) {
  const days = diffDays(inv.due_date, today);
  const when = days < 0 ? `is due on ${inv.due_date}` : `was due on ${inv.due_date} (${days} day${days === 1 ? "" : "s"} ago)`;
  const tone =
    step.action === "escalate"
      ? "This invoice is now significantly overdue and has been passed to our finance team. Please pay or contact us today."
      : days < 0
        ? "This is a friendly reminder ahead of the due date."
        : "We have not yet received payment for this invoice.";
  return {
    subject: `${days < 0 ? "Upcoming payment" : "Payment overdue"}: invoice ${inv.number} (${money(inv.balance)})`,
    body: `Hi ${inv.contact_name},\n\nInvoice ${inv.number} for ${money(inv.balance)} ${when}.\n${tone}\n\nView the invoice: ${appUrl}/portal/invoices/${inv.id}\n`,
  };
}

/** Send the most recent applicable step for each unpaid invoice, once per (invoice, step). */
export async function runDunning({ db, env, today }: JobContext) {
  const schedule = await getSchedule(db);
  const earliest = Math.min(...schedule.map((s) => s.offsetDays));
  const invoices = await all<DueInvoice>(
    env.DB,
    `SELECT i.id, i.number, i.customer_id, c.email, c.contact_name, c.user_id, i.due_date, i.total - i.amount_paid AS balance,
            (SELECT group_concat(step) FROM payment_reminders r WHERE r.invoice_id = i.id) AS sent_steps
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE i.status = 'confirmed' AND i.total > i.amount_paid AND i.due_date <= ?1
     LIMIT 500`,
    addDays(today, -earliest),
  );
  const staff = await all<{ id: string; email: string }>(env.DB, `SELECT id, email FROM users WHERE role IN ('admin','staff') AND is_active = 1`);
  let sent = 0;
  let escalated = 0;
  for (const inv of invoices) {
    const days = diffDays(inv.due_date, today);
    const applicable = schedule.filter((s) => days >= s.offsetDays);
    const step = applicable[applicable.length - 1];
    const already = new Set((inv.sent_steps ?? "").split(",").filter(Boolean));
    if (!step || already.has(step.step)) continue;
    // Claim the step first; the unique (invoice_id, step) index makes concurrent runs safe.
    const reminderId = newId();
    const claim = await env.DB.prepare(`INSERT OR IGNORE INTO payment_reminders (id, invoice_id, step) VALUES (?1, ?2, ?3)`)
      .bind(reminderId, inv.id, step.step)
      .run();
    if (!claim.meta.changes) continue;
    const msg = message(step, inv, today, env.APP_URL);
    const notificationId = await sendEmail(db, env, { to: inv.email, userId: inv.user_id, subject: msg.subject, body: msg.body, entity: "invoice", entityId: inv.id });
    await env.DB.batch([
      env.DB.prepare(`UPDATE payment_reminders SET notification_id = ?1 WHERE id = ?2`).bind(notificationId, reminderId),
      env.DB.prepare(
        `INSERT INTO customer_activity (id, customer_id, type, entity, entity_id, summary) VALUES (?1, ?2, 'reminder.sent', 'invoice', ?3, ?4)`,
      ).bind(newId(), inv.customer_id, inv.id, `Reminder "${step.step}" sent for ${inv.number} (simulated email)`),
    ]);
    sent++;
    if (step.action !== "remind") {
      escalated++;
      for (const s of staff) {
        await notifyInApp(db, {
          userId: s.id,
          recipient: s.email,
          subject: `${step.action === "escalate" ? "Escalation" : "Follow up"}: ${inv.number} is ${days} days overdue`,
          body: `${inv.contact_name} owes ${money(inv.balance)} on ${inv.number}.`,
          entity: "invoice",
          entityId: inv.id,
        });
      }
    }
  }
  return { sent, escalated };
}

