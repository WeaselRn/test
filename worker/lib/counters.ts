/**
 * Human-readable sequential numbers (SUB-000001, INV-000001). The counter row is
 * incremented atomically; a gap appears only if the later insert fails, which is
 * acceptable for display numbers (uniqueness is still enforced by the database).
 */
export async function nextNumber(d1: D1Database, name: "subscription" | "invoice", prefix: string): Promise<string> {
  const row = await d1
    .prepare(
      `INSERT INTO counters (name, value) VALUES (?1, 1)
       ON CONFLICT(name) DO UPDATE SET value = counters.value + 1
       RETURNING value`,
    )
    .bind(name)
    .first<{ value: number }>();
  if (!row) throw new Error(`Counter ${name} failed`);
  return `${prefix}-${String(row.value).padStart(6, "0")}`;
}
