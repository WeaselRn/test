/**
 * Audit log and customer activity timeline writers. Modules call these after every
 * state change so the Customer 360° timeline and the audit trail stay complete.
 * Both return insert builders so callers can include them in a `db.batch([...])`.
 */
import type { ActivityType } from "../../shared/types";
import { schema, newId, type Database } from "./db";

export function auditEntry(
  db: Database,
  e: { actorId: string | null; action: string; entity: string; entityId?: string | null; meta?: unknown },
) {
  return db.insert(schema.auditLog).values({
    id: newId(),
    actorId: e.actorId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    meta: e.meta ?? null,
  });
}

export function activityEntry(
  db: Database,
  e: {
    customerId: string;
    type: ActivityType;
    summary: string;
    actorId?: string | null;
    entity?: string;
    entityId?: string;
  },
) {
  return db.insert(schema.customerActivity).values({
    id: newId(),
    customerId: e.customerId,
    type: e.type,
    summary: e.summary,
    actorId: e.actorId ?? null,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
  });
}
