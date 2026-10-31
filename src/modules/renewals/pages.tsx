/** Smart Renewal Management. Owner: Person 4. */
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Page, PageHeader, Segmented, Stat, StatusBadge, Toolbar, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { date, money } from "@/lib/utils";

interface Task {
  id: string;
  status: string;
  dueOn: string;
  daysLeft: number;
  subscriptionId: string;
  subscriptionNumber: string;
  customerId: string;
  customerName: string;
  planName: string;
  monthlyValue: string;
  renewalSubscriptionId: string | null;
  renewalNumber: string | null;
  renewalStatus: string | null;
}

export function RenewalsPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const canWrite = useCan("subscription:write");
  const status = list.params.get("status") ?? "";
  const window = list.params.get("window") ?? "";
  const summary = useQuery({ queryKey: ["renewals", "summary"], queryFn: () => api.get<{ dueIn7: number; dueIn30: number; awaitingResponse: number; renewed: number; expired: number }>("/renewals/summary") });
  const tasks = useQuery({ queryKey: ["renewals", list.page, status, window], queryFn: () => api.list<Task>("/renewals", { page: list.page, status: status || undefined, window: window || undefined }) });
  const scan = useAction(() => api.post<{ data: { created: number } }>("/renewals/scan"), { success: (r) => `${r.data.created} new renewal task(s)`, invalidate: [["renewals"]] });
  const quote = useAction((id: string) => api.post<{ data: { id: string; number: string } }>(`/renewals/${id}/quote`), {
    success: (r) => `Renewal quotation ${r.data.number} prepared`,
    invalidate: [["renewals"], ["subscriptions"]],
    onSuccess: (r) => navigate(`/subscriptions/${r.data.id}`),
  });
  const close = useAction((id: string) => api.patch(`/renewals/${id}`, { status: "cancelled", note: "Customer will not renew" }), { success: "Marked as not renewing", invalidate: [["renewals"]] });

  return (
    <Page>
      <PageHeader
        title="Renewals"
        description="Subscriptions approaching expiry. Prepare a renewal quotation before they silently lapse."
        actions={canWrite && <Button variant="secondary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}><RefreshCw /> Scan now</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Due in 7 days" value={summary.data?.dueIn7 ?? "—"} tone={summary.data?.dueIn7 ? "danger" : undefined} />
        <Stat label="Due in 30 days" value={summary.data?.dueIn30 ?? "—"} />
        <Stat label="Quotes awaiting response" value={summary.data?.awaitingResponse ?? "—"} />
        <Stat label="Renewed" value={summary.data?.renewed ?? "—"} tone="success" />
        <Stat label="Expired" value={summary.data?.expired ?? "—"} />
      </div>
      <Card>
        <Toolbar>
          <Segmented
            value={status}
            onChange={(v) => list.set({ status: v })}
            items={[
              { value: "", label: "All" },
              { value: "open", label: "Needs quote" },
              { value: "quoted", label: "Quoted" },
              { value: "renewed", label: "Renewed" },
              { value: "expired", label: "Expired" },
            ]}
          />
          <Segmented value={window} onChange={(v) => list.set({ window: v })} items={[{ value: "", label: "Any time" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
        </Toolbar>
        <DataTable
          columns={[
            { key: "sub", header: "Subscription", cell: (t) => <Link className="font-medium text-ink hover:text-primary" to={`/subscriptions/${t.subscriptionId}`}>{t.subscriptionNumber}</Link> },
            { key: "cust", header: "Customer", cell: (t) => <Link className="hover:text-primary" to={`/customers/${t.customerId}`}>{t.customerName}</Link> },
            { key: "plan", header: "Plan", hideOnMobile: true, cell: (t) => t.planName },
            { key: "due", header: "Expires", cell: (t) => <span className={t.daysLeft <= 7 ? "text-danger" : ""}>{date(t.dueOn)} · {t.daysLeft >= 0 ? `${t.daysLeft}d left` : "expired"}</span> },
            { key: "mrr", header: "Monthly value", align: "right", hideOnMobile: true, cell: (t) => money(t.monthlyValue) },
            { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
            {
              key: "act",
              header: "",
              align: "right",
              cell: (t) =>
                t.status === "open" && canWrite ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => quote.mutate(t.id)} loading={quote.isPending && quote.variables === t.id}>Prepare quote</Button>
                    <Button size="sm" variant="ghost" onClick={() => close.mutate(t.id)}>Won't renew</Button>
                  </div>
                ) : t.renewalSubscriptionId ? (
                  <Link className="text-[12px] font-medium text-primary hover:underline" to={`/subscriptions/${t.renewalSubscriptionId}`}>{t.renewalNumber}</Link>
                ) : null,
            },
          ]}
          result={tasks.data}
          isLoading={tasks.isLoading}
          error={tasks.error}
          onPage={(page) => list.set({ page }, false)}
          empty={<EmptyState icon={<CalendarClock />} title="No renewals in this view" description="Renewal tasks open automatically 30 days before a renewable subscription expires." />}
        />
      </Card>
    </Page>
  );
}
