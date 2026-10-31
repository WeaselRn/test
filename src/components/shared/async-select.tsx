/**
 * Searchable select backed by a paginated list endpoint (customers, invoices …).
 * Owner: Person 1. Used by every module that picks a record from a large table.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AsyncSelect<T extends { id: string }>({
  path,
  value,
  onChange,
  getLabel,
  getDetail,
  placeholder = "Search…",
  extraQuery,
  invalid,
  initialLabel,
  id,
}: {
  path: string;
  value: string | null | undefined;
  onChange: (id: string, row: T) => void;
  getLabel: (row: T) => string;
  getDetail?: (row: T) => string;
  placeholder?: string;
  extraQuery?: Record<string, string>;
  invalid?: boolean;
  initialLabel?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [label, setLabel] = useState(initialLabel ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setLabel(initialLabel ?? ""), [initialLabel]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = useQuery({
    queryKey: ["async-select", path, debounced, extraQuery],
    queryFn: () => api.list<T>(path, { page: 1, pageSize: 20, q: debounced || undefined, ...extraQuery }),
    enabled: open,
  });

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        aria-invalid={invalid}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-line bg-surface px-3 text-left text-sm shadow-card hover:border-line-strong",
          "focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none aria-invalid:border-danger",
          !value && "text-faint",
        )}
      >
        <span className="truncate">{value ? label || "Selected" : placeholder}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full animate-slide-up rounded-lg bg-surface p-1 shadow-pop">
          <label className="flex items-center gap-2 border-b border-line px-2 pb-1.5">
            <Search className="size-3.5 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search" className="h-8 w-full bg-transparent text-sm focus:outline-none" />
          </label>
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.isLoading && <li className="px-2.5 py-2 text-[13px] text-muted">Searching…</li>}
            {results.data?.data.length === 0 && <li className="px-2.5 py-2 text-[13px] text-muted">No matches</li>}
            {results.data?.data.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(row.id, row);
                    setLabel(getLabel(row));
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{getLabel(row)}</span>
                    {getDetail && <span className="block truncate text-[12px] text-muted">{getDetail(row)}</span>}
                  </span>
                  {row.id === value && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
