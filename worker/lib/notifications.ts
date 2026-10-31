/**
 * Single entry point for outgoing messages (reset links, invoices, dunning reminders).
 *
 * EMAIL_MODE=outbox (default): the message is stored in `notifications` with status
 * "simulated" and logged to the console. It is never delivered and the UI labels it
 * as simulated. A real provider can be added here later without touching callers.
 */
import { schema, newId, type Database } from "./db";

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  userId?: string | null;
  entity?: string;
  entityId?: string;
}

export async function sendEmail(db: Database, env: Env, email: OutgoingEmail): Promise<string> {
  const id = newId();
  await db.insert(schema.notifications).values({
    id,
    channel: "email",
    userId: email.userId ?? null,
    recipient: email.to,
    subject: email.subject,
    body: email.body,
    status: env.EMAIL_MODE === "outbox" ? "simulated" : "failed",
    entity: email.entity ?? null,
    entityId: email.entityId ?? null,
  });
  console.log(`[email:${env.EMAIL_MODE}] to=${email.to} subject="${email.subject}"\n${email.body}`);
  return id;
}

export async function notifyInApp(
  db: Database,
  n: { userId: string; recipient: string; subject: string; body: string; entity?: string; entityId?: string },
): Promise<string> {
  const id = newId();
  await db.insert(schema.notifications).values({
    id,
    channel: "in_app",
    userId: n.userId,
    recipient: n.recipient,
    subject: n.subject,
    body: n.body,
    status: "sent",
    entity: n.entity ?? null,
    entityId: n.entityId ?? null,
  });
  return id;
}
