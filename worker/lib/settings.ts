/** Typed access to the `settings` key/value table. Owner: Person 1. */
import { eq } from "drizzle-orm";
import { nowISO, schema, type Database } from "./db";

export async function getSetting<T>(db: Database, key: string, fallback: T): Promise<T> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return (row?.value as T | undefined) ?? fallback;
}

export async function setSetting(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: nowISO() } });
}
