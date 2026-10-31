/** Smart Cancellation & Retention analytics. Owner: Person 4. */
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { Card, CardHeader, EmptyState, Page, PageHeader, Skeleton, Stat, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, titleCase } from "@/lib/utils";

interface RetentionStats {
  requests: number;
  retained: number;
  cancelled: number;
  retentionRate: number;
  byReason: { reason: string; total: number; retained: number; cancelled: number; offered: number }[];
  recent: { id: string; reason: string; outcome: string; offeredAlternative: string | null; comment: string | null; createdAt: string; subscriptionNumber: string; customerName: string }[];
}

export function RetentionPage() {
  const stats = useQuery({ queryKey: ["retention"], queryFn: () => api.get<{ data: RetentionStats }>("/retention/stats").then((r) => r.data) });
  const s = stats.data;
  const max = Math.max(1, ...(s?.byReason.map((r) => r.total) ?? [1]));
  return (
    <Page>
      <PageHeader
        title="Retention"
        description="Why customers ask to cancel and how often a fair alternative keeps them. Cancellation is never blocked."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cancellation requests" value={s?.requests ?? "—"} />
        <Stat label="Accepted an alternative" value={s?.retained ?? "—"} tone="success" />
        <Stat label="Completed cancellation" value={s?.cancelled ?? "—"} />
        <Stat label="Retention rate" value={s ? `${s.retentionRate}%` : "—"} detail="Of requests where an alternative was offered" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader title="Reasons" />
          {!s ? <Skeleton className="m-4 h-40" /> : s.byReason.length ? (
            <ul className="space-y-3 p-5">
              {s.byReason.map((r) => (
                <li key={r.reason} className="text-[13px]">
                  <div className="mb-1 flex justify-between"><span className="text-ink">{titleCase(r.reason)}</span><span className="tabular text-muted">{r.total} · {r.retained} retained</span></div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-subtle">
                    <div className="bg-success" style={{ width: `${(r.retained / max) * 100}%` }} />
                    <div className="bg-accent" style={{ width: `${((r.total - r.retained) / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<LifeBuoy />} title="No cancellation requests yet" />
          )}
        </Card>
        <Card>
          <CardHeader title="Recent requests" />
          {s?.recent.length ? (
            <ul className="divide-y divide-line">
              {s.recent.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3 text-[13px]">
                  <div>
                    <div className="text-ink">{r.customerName} · {r.subscriptionNumber}</div>
                    <div className="text-[12px] text-muted">{titleCase(r.reason)}{r.offeredAlternative && ` · offered ${r.offeredAlternative.startsWith("plan") ? "plan change" : r.offeredAlternative}`} · {dateTime(r.createdAt)}</div>
                    {r.comment && <div className="mt-1 text-[12px] text-body">“{r.comment}”</div>}
                  </div>
                  <StatusBadge status={r.outcome} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing yet" description="Requests appear when customers start cancelling from the portal." />
          )}
        </Card>
      </div>
    </Page>
  );
}
