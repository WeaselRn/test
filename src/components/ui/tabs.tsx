import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Underlined tabs for sections inside a page. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-5 overflow-x-auto border-b border-line px-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-[13px] whitespace-nowrap transition-colors",
            value === it.value ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn("tabular rounded-full px-1.5 text-[11px]", value === it.value ? "bg-accent-soft text-accent-ink" : "bg-subtle text-muted")}>
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Pill filter for list status filters ("All", "Active", …). */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-subtle p-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
            value === it.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Label/value grid for detail pages. */
export function DescriptionList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[12px] text-muted">{it.label}</dt>
          <dd className="mt-0.5 text-[13px] text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Toolbar row above a table: filters on the left, search on the right. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}
