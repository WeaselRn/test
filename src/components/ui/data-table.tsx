/**
 * Data table with server-side pagination and sorting (PRD §8: no unbounded lists).
 * State lives in the URL (?page=&sort=&q=) via useListParams, so lists are linkable.
 * Below 768px rows render as stacked cards.
 */
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { Paginated } from "@shared/api";
import { DEFAULT_PAGE_SIZE } from "@shared/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { EmptyState, ErrorState, Skeleton } from "./feedback";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server sort key; omit for unsortable columns. */
  sortKey?: string;
  align?: "left" | "right";
  className?: string;
  /** Hide on the mobile card layout. */
  hideOnMobile?: boolean;
}

export function useListParams(defaults: { sort?: string } = {}) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1) || 1;
  const sort = params.get("sort") ?? defaults.sort;
  const q = params.get("q") ?? "";
  const set = (patch: Record<string, string | number | null | undefined>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined || v === "") next.delete(k);
          else next.set(k, String(v));
        }
        if (resetPage && !("page" in patch)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  };
  return { page, sort, q, params, set, query: { page, pageSize: DEFAULT_PAGE_SIZE, sort, q: q || undefined } };
}

export function DataTable<T extends { id: string }>({
  columns,
  result,
  isLoading,
  error,
  onRetry,
  sort,
  onSort,
  onPage,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  result: Paginated<T> | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: string;
  onSort?: (sort: string) => void;
  onPage?: (page: number) => void;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  if (error) return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />;

  const rows = result?.data ?? [];
  const toggleSort = (key: string) => onSort?.(sort === key ? `-${key}` : key);

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => {
                const active = sort === c.sortKey || sort === `-${c.sortKey}`;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "h-9 px-4 text-[12px] font-medium whitespace-nowrap text-muted",
                      c.align === "right" && "text-right",
                      c.className,
                    )}
                  >
                    {c.sortKey && onSort ? (
                      <button
                        onClick={() => toggleSort(c.sortKey!)}
                        className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}
                      >
                        {c.header}
                        {active && (sort?.startsWith("-") ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className="h-12 px-4">
                        <Skeleton className="h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-subtle/70")}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("h-12 px-4 text-body", c.align === "right" && "tabular text-right", c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-line md:hidden">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))
          : rows.map((row) => (
              <div
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("space-y-1.5 p-4", onRowClick && "cursor-pointer active:bg-subtle")}
              >
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-4 text-[13px]">
                      <span className="text-muted">{c.header}</span>
                      <span className="text-right text-body">{c.cell(row)}</span>
                    </div>
                  ))}
              </div>
            ))}
      </div>

      {!isLoading && rows.length === 0 && (empty ?? <EmptyState title="Nothing here yet" />)}

      {result && result.total > 0 && <Pagination result={result} onPage={onPage} />}
    </div>
  );
}

function Pagination({ result, onPage }: { result: Paginated<unknown>; onPage?: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12px] text-muted">
      <span className="tabular">
        {from.toLocaleString()}–{to.toLocaleString()} of {result.total.toLocaleString()}
      </span>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" disabled={result.page <= 1} onClick={() => onPage?.(result.page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button variant="secondary" size="sm" disabled={result.page >= pages} onClick={() => onPage?.(result.page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
