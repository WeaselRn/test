/** REP-1..3: finance dashboard and reports. Owner: Person 3. */
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Download, FileText, Repeat, TrendingUp, Wallet } from "lucide-react";
import { addMonths, todayISO } from "@shared/dates";
import { Button, Card, CardHeader, EmptyState, Field, Input, Page, PageHeader, Skeleton, Stat, StatusBadge, Tabs } from "@/components/ui";
import { toQueryString } from "@/lib/api";
import { api } from "@/lib/api";
import { downloadUrl } from "@/lib/hooks";
import { date, money, titleCase } from "@/lib/utils";
import { MrrChart, RevenueChart } from "./charts";

interface Summary {
  activeSubscriptions: number;
  mrr: string;
  arr: string;
  revenueCollected: string;
  paymentsCount: number;
  amountOutstanding: string;
  overdueInvoices: number;
  overdueAmount: string;
  draftInvoices: number;
  range: { from: string; to: string };
}
interface Overdue {
  data: { id: string; number: string; customerName: string; dueDate: string; balance: string; daysOverdue: number }[];
  aging: { bucket: string; count: number; amount: string }[];
}

/** Dashboard refreshes every 60 s (SYS-2) — polling, well inside free-plan request limits. */
const POLL = 60_000;

export function DashboardPage() {
  const summary = useQuery({ queryKey: ["reports", "summary"], queryFn: () => api.get<{ data: Summary }>("/reports/summary").then((r) => r.data), refetchInterval: POLL });
  const revenue = useQuery({ queryKey: ["reports", "revenue"], queryFn: () => api.get<{ data: { period: string; collected: string; billed: string }[] }>("/reports/revenue"), refetchInterval: POLL });
  const overdue = useQuery({ queryKey: ["reports", "overdue"], queryFn: () => api.get<Overdue>("/reports/overdue"), refetchInterval: POLL });
  const leakage = useQuery({ queryKey: ["findings", "summary", "leakage"], queryFn: () => api.get<{ totalAtRisk: string; openCount: number }>("/findings/summary", { kind: "leakage" }) });
  const s = summary.data;

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description={s ? `Revenue for ${date(s.range.from)} – ${date(s.range.to)} · refreshes every minute` : "Live finance overview"}
        actions={<Link to="/reports"><Button variant="secondary">All reports <ArrowRight /></Button></Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {s ? (
          <>
            <Stat label="Active subscriptions" value={s.activeSubscriptions.toLocaleString("en-IN")} detail={`MRR ${money(s.mrr)} · ARR ${money(s.arr)}`} icon={<Repeat />} />
            <Stat label="Revenue collected" value={money(s.revenueCollected)} detail={`${s.paymentsCount} payments this month`} icon={<TrendingUp />} tone="success" />
            <Stat label="Amount outstanding" value={money(s.amountOutstanding)} detail={s.draftInvoices ? `${s.draftInvoices} draft invoices awaiting confirmation` : "Confirmed, unpaid balances"} icon={<Wallet />} />
            <Stat label="Overdue invoices" value={s.overdueInvoices} detail={`${money(s.overdueAmount)} past due`} icon={<AlertTriangle />} tone={s.overdueInvoices ? "danger" : undefined} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {leakage.data && leakage.data.openCount > 0 && (
        <Link to="/finance/leakage" className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-[13px] text-accent-ink hover:border-accent/50">
          <span><span className="font-semibold">{money(leakage.data.totalAtRisk)}</span> of potential revenue at risk across {leakage.data.openCount} open leakage findings.</span>
          <span className="flex items-center gap-1 font-medium">Review <ArrowRight className="size-3.5" /></span>
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Billed vs collected" description="Last 12 months" />
          <div className="p-4">{revenue.data ? <RevenueChart data={revenue.data.data} /> : <Skeleton className="h-64" />}</div>
        </Card>
        <Card>
          <CardHeader title="Overdue invoices" action={<Link to="/payments/outstanding?overdue=true" className="text-[12px] font-medium text-primary hover:underline">View all</Link>} />
          <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
            {overdue.data?.aging.map((a) => (
              <div key={a.bucket} className="bg-surface px-3 py-2.5">
                <div className="text-[11px] text-muted">{a.bucket} days</div>
                <div className="tabular text-[13px] font-semibold text-ink">{a.count}</div>
              </div>
            ))}
          </div>
          {overdue.data?.data.length ? (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {overdue.data.data.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link to={`/invoices/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-subtle/70">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{o.customerName}</span>
                      <span className="text-[12px] text-muted">{o.number} · due {date(o.dueDate)}</span>
                    </span>
                    <span className="text-right">
                      <span className="tabular block text-ink">{money(o.balance)}</span>
                      <span className="text-[12px] text-danger">{o.daysOverdue} days</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No overdue invoices" description="Every confirmed invoice is within its terms." />
          )}
        </Card>
      </div>
    </Page>
  );
}

type Tab = "revenue" | "mrr" | "subscriptions" | "payments" | "overdue";

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("revenue");
  const today = todayISO();
  const [from, setFrom] = useState(addMonths(`${today.slice(0, 8)}01`, -11));
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<"month" | "week" | "day">("month");
  const range = { from, to };
  const summary = useQuery({ queryKey: ["reports", "summary", range], queryFn: () => api.get<{ data: Summary }>("/reports/summary", range).then((r) => r.data) });
  const revenue = useQuery({ queryKey: ["reports", "revenue", range, groupBy], queryFn: () => api.get<{ data: { period: string; collected: string; billed: string }[] }>("/reports/revenue", { ...range, groupBy }), enabled: tab === "revenue" });
  const mrr = useQuery({ queryKey: ["reports", "mrr"], queryFn: () => api.get<{ data: { period: string; mrr: string; subscriptions: number }[] }>("/reports/mrr"), enabled: tab === "mrr" });
  const subs = useQuery({
    queryKey: ["reports", "subscriptions"],
    queryFn: () => api.get<{ byStatus: { status: string; count: number }[]; byPlan: { planId: string; name: string; billingPeriod: string; active: number; mrr: string }[] }>("/reports/subscriptions"),
    enabled: tab === "subscriptions",
  });
  const payments = useQuery({ queryKey: ["reports", "payments", range], queryFn: () => api.get<{ data: { method: string; count: number; amount: string }[] }>("/reports/payments", range), enabled: tab === "payments" });
  const overdue = useQuery({ queryKey: ["reports", "overdue"], queryFn: () => api.get<Overdue>("/reports/overdue"), enabled: tab === "overdue" });
  const exportKind = tab === "payments" ? "payments" : tab === "subscriptions" || tab === "mrr" ? "subscriptions" : "invoices";

  return (
    <Page>
      <PageHeader
        title="Reports"
        description="Revenue, MRR, subscription, payment and overdue reports with CSV export."
        actions={<Button variant="secondary" onClick={() => downloadUrl(`/api/v1/reports/export/${exportKind}${toQueryString(range)}`)}><Download /> Export {exportKind} CSV</Button>}
      />
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="From" htmlFor="r-from"><Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="r-to"><Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {summary.data && (
            <div className="flex flex-wrap gap-6 pb-1 text-[13px]">
              <div><div className="text-[12px] text-muted">Collected in range</div><div className="tabular font-semibold text-ink">{money(summary.data.revenueCollected)}</div></div>
              <div><div className="text-[12px] text-muted">Outstanding now</div><div className="tabular font-semibold text-ink">{money(summary.data.amountOutstanding)}</div></div>
              <div><div className="text-[12px] text-muted">MRR</div><div className="tabular font-semibold text-ink">{money(summary.data.mrr)}</div></div>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          className="px-4"
          items={[
            { value: "revenue", label: "Revenue" },
            { value: "mrr", label: "MRR trend" },
            { value: "subscriptions", label: "Subscriptions" },
            { value: "payments", label: "Payments" },
            { value: "overdue", label: "Overdue" },
          ]}
        />
        <div className="p-4">
          {tab === "revenue" && (
            <>
              <div className="mb-3 flex justify-end gap-1">
                {(["month", "week", "day"] as const).map((g) => (
                  <Button key={g} size="sm" variant={groupBy === g ? "primary" : "ghost"} onClick={() => setGroupBy(g)}>{titleCase(g)}</Button>
                ))}
              </div>
              {revenue.data ? <RevenueChart data={revenue.data.data} /> : <Skeleton className="h-64" />}
              <ReportTable head={["Period", "Billed", "Collected"]} rows={revenue.data?.data.map((r) => [r.period, money(r.billed), money(r.collected)])} />
            </>
          )}
          {tab === "mrr" && (
            <>
              {mrr.data ? <MrrChart data={mrr.data.data} /> : <Skeleton className="h-60" />}
              <p className="mt-2 text-[12px] text-muted">MRR normalises each active subscription to a month: monthly × 1, yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12.</p>
              <ReportTable head={["Month", "Subscriptions", "MRR"]} rows={mrr.data?.data.map((r) => [r.period, String(r.subscriptions), money(r.mrr)])} />
            </>
          )}
          {tab === "subscriptions" && (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <ul className="space-y-2">
                {subs.data?.byStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between rounded-md bg-subtle px-3 py-2 text-[13px]"><StatusBadge status={s.status} /><span className="tabular font-semibold text-ink">{s.count}</span></li>
                ))}
              </ul>
              <ReportTable head={["Plan", "Billing", "Active", "MRR"]} rows={subs.data?.byPlan.map((p) => [p.name, titleCase(p.billingPeriod), String(p.active), money(p.mrr)])} />
            </div>
          )}
          {tab === "payments" && <ReportTable head={["Method", "Payments", "Amount"]} rows={payments.data?.data.map((p) => [titleCase(p.method), String(p.count), money(p.amount)])} />}
          {tab === "overdue" && (
            <ReportTable
              head={["Invoice", "Customer", "Due", "Days overdue", "Balance"]}
              rows={overdue.data?.data.map((o) => [o.number, o.customerName, date(o.dueDate), String(o.daysOverdue), money(o.balance)])}
            />
          )}
        </div>
      </Card>
    </Page>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows?: string[][] }) {
  if (!rows) return <Skeleton className="mt-4 h-32" />;
  if (!rows.length) return <EmptyState icon={<FileText />} title="No data for this range" />;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            {head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 ${j > 0 ? "text-right" : "text-ink"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
