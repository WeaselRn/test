/**
 * Small helpers for raw D1 SQL (aggregates and reports). Always bind values; never
 * interpolate request input into SQL text. Owner: Person 1.
 */
export async function all<T>(d1: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await d1.prepare(sql).bind(...binds).all<T>();
  return res.results;
}

export async function first<T>(d1: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  return d1.prepare(sql).bind(...binds).first<T>();
}

/** `%term%` for LIKE (case-insensitive for ASCII in SQLite). */
export function likeTerm(q: string): string {
  return `%${q.trim()}%`;
}

/** CSV with RFC 4180 quoting; formula-leading cells are prefixed to avoid spreadsheet injection. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

/** Monthly-normalised recurring amount of a subscription row aliased `s` joined to plan `p`. */
export const MRR_EXPR = `(CASE p.billing_period
  WHEN 'monthly' THEN 1.0 WHEN 'yearly' THEN 1.0/12 WHEN 'weekly' THEN 52.0/12 ELSE 365.0/12 END)
  * (p.price + COALESCE((SELECT SUM(l.amount) FROM subscription_lines l WHERE l.subscription_id = s.id), 0))`;
