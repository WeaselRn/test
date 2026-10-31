/** Customer Subscription Health Score. Owner: Person 4. */
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { Card, DataTable, EmptyState, Page, PageHeader, Segmented, StatusBadge, Toolbar, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/utils";

export interface Health {
  customerId: string;
  customerName: string;
  email: string;
  score: number;
  category: "healthy" | "needs_attention" | "at_risk";
  reasons: { signal: string; penalty: number }[];
  nextAction: string;
  activeSubscriptions: number;
  outstanding: string;
}

const CATEGORY_LABEL = { healthy: "Healthy", needs_attention: "Needs attention", at_risk: "At risk" } as const;

export function HealthMeter({ health }: { health: Health }) {
  const color = health.category === "healthy" ? "bg-success" : health.category === "needs_attention" ? "bg-pending" : "bg-danger";
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <span className="tabular text-3xl font-semibold text-ink">{health.score}<span className="text-[13px] font-normal text-muted"> / 100</span></span>
        <StatusBadge status={health.category} label={CATEGORY_LABEL[health.category]} />
      </div>
      <div className="h-2 rounded-full bg-subtle"><div className={cn("h-2 rounded-full", color)} style={{ width: `${health.score}%` }} /></div>
      {health.reasons.length ? (
        <ul className="space-y-1 text-[12px]">
          {health.reasons.map((r) => (
            <li key={r.signal} className="flex justify-between gap-2"><span className="text-body">{r.signal}</span><span className="tabular text-danger">−{r.penalty}</span></li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">No risk signals.</p>
      )}
      <p className="rounded-md bg-primary-soft px-3 py-2 text-[12px] text-primary-ink"><span className="font-semibold">Next action:</span> {health.nextAction}</p>
      <p className="text-[11px] text-faint">Rule-based score, not a statistical churn probability.</p>
    </div>
  );
}

type HealthList = Awaited<ReturnType<typeof api.list<Health & { id: string }>>> & { counts: Record<Health["category"], number> };

export function HealthPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const category = list.params.get("category") ?? "";
  const health = useQuery({
    queryKey: ["customers", "health", list.page, category],
    queryFn: () => api.get<HealthList>("/customers/health", { page: list.page, pageSize: 25, category: category || undefined }),
    select: (r) => ({ ...r, data: r.data.map((h) => ({ ...h, id: h.customerId })) }),
  });
  const counts = health.data?.counts;
  return (
    <Page>
      <PageHeader
        title="Customer health"
        description="Each customer starts at 100; late payments, overdue invoices, expiring contracts, pauses and cancellation requests subtract points."
      />
      <Card>
        <Toolbar>
          <Segmented
            value={category}
            onChange={(v) => list.set({ category: v })}
            items={[
              { value: "", label: "All" },
              { value: "at_risk", label: `At risk${counts ? ` (${counts.at_risk})` : ""}` },
              { value: "needs_attention", label: `Needs attention${counts ? ` (${counts.needs_attention})` : ""}` },
              { value: "healthy", label: `Healthy${counts ? ` (${counts.healthy})` : ""}` },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={[
            { key: "name", header: "Customer", cell: (h) => <span className="font-medium text-ink">{h.customerName}</span> },
            { key: "score", header: "Score", align: "right", cell: (h) => <span className="font-semibold text-ink">{h.score}</span> },
            { key: "cat", header: "Category", cell: (h) => <StatusBadge status={h.category} label={CATEGORY_LABEL[h.category]} /> },
            { key: "reasons", header: "Why", hideOnMobile: true, cell: (h) => <span className="text-[12px] text-muted">{h.reasons.map((r) => r.signal).join(" · ") || "No risk signals"}</span> },
            { key: "out", header: "Outstanding", align: "right", hideOnMobile: true, cell: (h) => money(h.outstanding) },
            { key: "next", header: "Next action", hideOnMobile: true, cell: (h) => <span className="text-[12px]">{h.nextAction}</span> },
          ]}
          result={health.data}
          isLoading={health.isLoading}
          error={health.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(h) => navigate(`/customers/${h.customerId}`)}
          empty={<EmptyState icon={<HeartPulse />} title="No customers in this category" />}
        />
      </Card>
    </Page>
  );
}
