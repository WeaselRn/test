/** Revenue Leakage Detector and Invoice Anomaly Detection. Owner: Person 3. */
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, Dialog, EmptyState, Field, Page, PageHeader, Segmented, Skeleton, Stat, StatusBadge, Tabs, Textarea, Toolbar, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { dateTime, money } from "@/lib/utils";

interface FindingRow {
  id: string;
  kind: "leakage" | "anomaly";
  rule: string;
  ruleLabel: string;
  severity: string;
  customerId: string | null;
  customerName: string | null;
  subscriptionId: string | null;
  subscriptionNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentId: string | null;
  amountAtRisk: string;
  expected: string | null;
  actual: string | null;
  explanation: string;
  suggestion: string;
  status: "open" | "reviewed" | "resolved";
  resolutionNote: string | null;
  detectedAt: string;
}
interface FindingSummary {
  totalAtRisk: string;
  openCount: number;
  bySeverity: { severity: string; count: number }[];
  byRule: { rule: string; label: string; count: number; amount: string }[];
}

export function LeakagePage() {
  const list = useListParams();
  const canWrite = useCan("finding:write");
  const kind = (list.params.get("kind") as "leakage" | "anomaly") ?? "leakage";
  const status = list.params.get("status") ?? "open";
  const severity = list.params.get("severity") ?? "";
  const [resolving, setResolving] = useState<FindingRow | null>(null);
  const summary = useQuery({ queryKey: ["findings", "summary", kind], queryFn: () => api.get<FindingSummary>("/findings/summary", { kind }) });
  const findings = useQuery({
    queryKey: ["findings", kind, status, severity, list.page],
    queryFn: () => api.list<FindingRow>("/findings", { kind, status: status || undefined, severity: severity || undefined, page: list.page, pageSize: 25 }),
  });
  const scan = useAction(() => api.post<{ data: { leakage: number; anomalies: number } }>("/findings/scan"), {
    success: (r) => `Scan complete: ${r.data.leakage} new leakage, ${r.data.anomalies} new anomaly findings`,
    invalidate: [["findings"]],
  });
  const update = useAction((v: { id: string; status: string; resolutionNote?: string }) => api.patch(`/findings/${v.id}`, v), {
    success: "Finding updated",
    invalidate: [["findings"]],
    onSuccess: () => setResolving(null),
  });

  return (
    <Page>
      <PageHeader
        title={kind === "leakage" ? "Revenue leakage" : "Invoice anomalies"}
        description={
          kind === "leakage"
            ? "Deterministic checks for revenue the business may be losing. Amounts are potential revenue at risk until verified."
            : "Rule-based checks on invoice records. An alert is a prompt to review, not proof of an error."
        }
        actions={canWrite && <Button variant="secondary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}><RefreshCw /> Run scan</Button>}
      />
      <Tabs
        value={kind}
        onChange={(v) => list.set({ kind: v })}
        className="mb-6"
        items={[
          { value: "leakage", label: "Revenue leakage" },
          { value: "anomaly", label: "Invoice anomalies" },
        ]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.data ? (
          <>
            <Stat label="Potential revenue at risk" value={money(summary.data.totalAtRisk)} tone={summary.data.openCount ? "danger" : "success"} icon={<AlertOctagon />} />
            {summary.data.bySeverity.slice(0, 3).map((s) => (
              <Stat key={s.severity} label={`${s.severity[0]!.toUpperCase()}${s.severity.slice(1)} severity`} value={s.count} detail="open or reviewed" />
            ))}
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
        )}
      </div>
      {!!summary.data?.byRule.length && (
        <div className="mb-6 flex flex-wrap gap-2">
          {summary.data.byRule.map((r) => (
            <span key={r.rule} className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-body shadow-card">
              {r.label} · <span className="font-semibold text-ink">{r.count}</span> · {money(r.amount)}
            </span>
          ))}
        </div>
      )}
      <Card>
        <Toolbar>
          <Segmented
            value={status}
            onChange={(v) => list.set({ status: v })}
            items={[
              { value: "open", label: "Open" },
              { value: "reviewed", label: "Reviewed" },
              { value: "resolved", label: "Resolved" },
              { value: "", label: "All" },
            ]}
          />
          <Segmented
            value={severity}
            onChange={(v) => list.set({ severity: v })}
            items={[
              { value: "", label: "Any severity" },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
        </Toolbar>
        {findings.isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : findings.data?.data.length ? (
          <ul className="divide-y divide-line">
            {findings.data.data.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={f.severity} />
                    <span className="text-[13px] font-semibold text-ink">{f.ruleLabel}</span>
                    {f.status !== "open" && <StatusBadge status={f.status} />}
                  </div>
                  <p className="text-[13px] text-body">{f.explanation}</p>
                  <p className="text-[12px] text-muted"><span className="font-medium text-accent-ink">Suggested:</span> {f.suggestion}</p>
                  <div className="flex flex-wrap gap-3 text-[12px]">
                    {f.customerId && <Link className="text-primary hover:underline" to={`/customers/${f.customerId}`}>{f.customerName}</Link>}
                    {f.subscriptionId && <Link className="text-primary hover:underline" to={`/subscriptions/${f.subscriptionId}`}>{f.subscriptionNumber}</Link>}
                    {f.invoiceId && <Link className="text-primary hover:underline" to={`/invoices/${f.invoiceId}`}>{f.invoiceNumber}</Link>}
                    {f.paymentId && <Link className="text-primary hover:underline" to="/payments?unmatched=true">Unmatched payment</Link>}
                    {f.expected !== null && <span className="text-muted">Expected {money(f.expected)} · actual {money(f.actual)}</span>}
                    <span className="text-faint">Detected {dateTime(f.detectedAt)}</span>
                  </div>
                  {f.resolutionNote && <p className="text-[12px] text-muted">Note: {f.resolutionNote}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <span className="tabular text-[15px] font-semibold text-ink">{money(f.amountAtRisk)}</span>
                  {canWrite && f.status !== "resolved" && (
                    <div className="flex gap-1">
                      {f.status === "open" && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: f.id, status: "reviewed" })}>Mark reviewed</Button>}
                      <Button size="sm" variant="secondary" onClick={() => setResolving(f)}>Resolve</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ShieldCheck />} title="Nothing found" description="No findings match these filters. Run a scan after billing to check again." />
        )}
        {findings.data && findings.data.total > findings.data.pageSize && (
          <div className="flex justify-end gap-2 border-t border-line p-3">
            <Button size="sm" variant="secondary" disabled={list.page <= 1} onClick={() => list.set({ page: list.page - 1 }, false)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={list.page * findings.data.pageSize >= findings.data.total} onClick={() => list.set({ page: list.page + 1 }, false)}>Next</Button>
          </div>
        )}
      </Card>
      {resolving && <ResolveDialog finding={resolving} onClose={() => setResolving(null)} onSave={(note) => update.mutate({ id: resolving.id, status: "resolved", resolutionNote: note })} loading={update.isPending} />}
    </Page>
  );
}

function ResolveDialog({ finding, onClose, onSave, loading }: { finding: FindingRow; onClose: () => void; onSave: (note: string) => void; loading: boolean }) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Resolve: ${finding.ruleLabel}`}
      description={finding.explanation}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(note)} loading={loading} disabled={!note.trim()}>Mark resolved</Button></>}
    >
      <Field label="Resolution note" htmlFor="res-note" hint="What was done, so the team has an audit trail.">
        <Textarea id="res-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  );
}
