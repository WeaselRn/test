/** INV-4: run billing now and billing run history. Owner: Person 1. */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { todayISO } from "@shared/dates";
import type { BillingRunResult } from "@shared/types";
import { Alert, Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Page, PageHeader, Stat, StatusBadge, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { dateTime, date, titleCase } from "@/lib/utils";

type RunRow = BillingRunResult & { actorName: string | null; details: { subscription: string; period: string; outcome: string; error?: string }[] | null };

export function BillingPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState("");
  const [last, setLast] = useState<RunRow | null>(null);
  const config = useQuery({ queryKey: ["billing", "config"], queryFn: () => api.get<{ demoMode: boolean }>("/billing/config") });
  const runs = useQuery({ queryKey: ["billing", "runs", list.query], queryFn: () => api.list<RunRow>("/billing/runs", list.query) });
  const { user } = useSession();
  const demo = useAction(() => api.post<{ data: { subscriptions: number; invoices: number; payments: number } }>("/demo/load"), {
    success: (r) => `Demo loaded: ${r.data.subscriptions} subscriptions, ${r.data.invoices} invoices, ${r.data.payments} payments`,
    invalidate: [["billing"], ["invoices"], ["subscriptions"], ["reports"], ["customers"], ["findings"]],
  });
  const run = useAction(() => api.post<{ data: RunRow }>("/billing/run", asOf ? { asOf } : {}), {
    success: (r) => `Billing finished: ${r.data.created} created, ${r.data.skipped} skipped, ${r.data.failed} failed`,
    invalidate: [["billing"], ["invoices"], ["subscriptions"], ["reports"]],
    onSuccess: (r) => setLast(r.data),
  });

  return (
    <Page>
      <PageHeader
        title="Billing runs"
        description="The scheduler bills every active subscription daily at 01:00 UTC. Run it now to bill anything due today; re-running never creates duplicates."
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><PlayCircle className="size-5" /></div>
            <div>
              <h3 className="text-[15px] font-semibold">Run billing now</h3>
              <p className="mt-0.5 text-[13px] text-muted">Creates draft invoices for every period due on or before the run date.</p>
            </div>
          </div>
          {config.data?.demoMode && (
            <Field label="Bill as of (demo mode)" htmlFor="asof" hint="Leave empty for today. Use a future date to simulate a month of billing." className="mt-4">
              <Input id="asof" type="date" value={asOf} min={todayISO()} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
          )}
          <Button className="mt-4 w-full" onClick={() => run.mutate(undefined)} loading={run.isPending}>Run billing{asOf ? ` as of ${date(asOf)}` : ""}</Button>
          {config.data?.demoMode && user?.role === "admin" && (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => demo.mutate(undefined)} loading={demo.isPending}>
              Load six-month demo scenario (empty database only)
            </Button>
          )}
        </Card>
        {last ? (
          <Card>
            <CardHeader title="Last run" description={`${titleCase(last.trigger)} run for ${date(last.runDate)}`} action={<Button size="sm" variant="secondary" onClick={() => navigate("/invoices?status=draft")}>Review drafts</Button>} />
            <div className="grid grid-cols-3 gap-3 p-4">
              <Stat label="Created" value={last.created} tone="success" />
              <Stat label="Skipped" value={last.skipped} detail="Already invoiced" />
              <Stat label="Failed" value={last.failed} tone={last.failed ? "danger" : undefined} />
            </div>
            {!!last.details?.length && (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line text-[13px]">
                {last.details.map((d, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2">
                    <span className="text-ink">{d.subscription}</span>
                    <span className="text-muted">{date(d.period)}</span>
                    <StatusBadge status={d.outcome === "created" ? "completed" : d.outcome === "failed" ? "failed" : "draft"} label={titleCase(d.outcome)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card className="grid place-items-center p-6">
            <Alert tone="success">Safe to run repeatedly: a unique rule on subscription + billing period makes duplicate invoices impossible.</Alert>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader title="History" />
        <DataTable
          columns={[
            { key: "when", header: "Started", cell: (r) => dateTime(r.startedAt) },
            { key: "date", header: "Run date", cell: (r) => date(r.runDate) },
            { key: "trigger", header: "Trigger", cell: (r) => <Badge tone={r.trigger === "cron" ? "draft" : "primary"}>{r.trigger === "cron" ? "Scheduler" : `Manual · ${r.actorName ?? ""}`}</Badge> },
            { key: "created", header: "Created", align: "right", cell: (r) => r.created },
            { key: "skipped", header: "Skipped", align: "right", cell: (r) => r.skipped },
            { key: "failed", header: "Failed", align: "right", cell: (r) => <span className={r.failed ? "text-danger" : ""}>{r.failed}</span> },
            { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          result={runs.data}
          isLoading={runs.isLoading}
          error={runs.error}
          onPage={(page) => list.set({ page }, false)}
          empty={<EmptyState title="No billing runs yet" />}
        />
      </Card>
    </Page>
  );
}
