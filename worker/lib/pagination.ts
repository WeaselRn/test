import type { SQL } from "drizzle-orm";
import { asc, desc } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { ListQuery, Paginated } from "../../shared/api";

export function pageOffset(q: Pick<ListQuery, "page" | "pageSize">) {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}

export function paginated<T>(data: T[], q: Pick<ListQuery, "page" | "pageSize">, total: number): Paginated<T> {
  return { data, page: q.page, pageSize: q.pageSize, total };
}

/**
 * Turn `?sort=-createdAt` into an ORDER BY using an allow-list of sortable columns.
 * Unknown keys fall back to the default so user input never reaches SQL directly.
 */
export function orderBy(
  sort: string | undefined,
  columns: Record<string, SQLiteColumn>,
  fallback: SQL,
): SQL {
  if (!sort) return fallback;
  const key = sort.replace(/^-/, "");
  const column = columns[key];
  if (!column) return fallback;
  return sort.startsWith("-") ? desc(column) : asc(column);
}
