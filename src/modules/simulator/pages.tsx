/** What-if Financial Simulator. Owner: Person 4. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { fromMinor, toMinor } from "@shared/money";
import { Alert, Button, Card, CardHeader, Page, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, money } from "@/lib/utils";
import { DEFAULT_ASSUMPTIONS, simulate, type Assumptions } from "./model";

interface BaselineDto {
  mrr: string;
  activeSubscriptions: number;
  customers: number;
  outstanding: string;
  overdue: string;
  collectionRate: number;
  plans: { id: string; name: string; billingPeriod: string; subscriptions: number; mrr: string }[];
}

const SLIDERS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; suffix: string; help: string }[] = [
  { key: "priceChangePct", label: "Price change", min: -50, max: 50, step: 1, suffix: "%", help: "Raise or lower every plan and line price." },
  { key: "churnPct", label: "Customers cancelling", min: 0, max: 50, step: 1, suffix: "%", help: "Share of subscriptions lost. Price increases rarely come without some churn." },
  { key: "downgradePct", label: "Customers downgrading", min: 0, max: 50, step: 1, suffix: "%", help: "Share of subscriptions that move to a cheaper plan." },
  { key: "downgradeImpactPct", label: "Value lost per downgrade", min: 0, max: 90, step: 5, suffix: "%", help: "How much cheaper the downgraded plan is." },
  { key: "discountPct", label: "Discount offered", min: 0, max: 50, step: 1, suffix: "%", help: "Discount size for the selected customers." },
  { key: "discountSharePct", label: "Customers receiving the discount", min: 0, max: 100, step: 5, suffix: "%", help: "Share of subscriptions that get the discount." },
  { key: "recoveryImprovementPct", label: "Better payment recovery", min: 0, max: 30, step: 1, suffix: " pts", help: "Percentage points added to the collection rate (e.g. from dunning)." },
  { key: "months", label: "Projection horizon", min: 1, max: 24, step: 1, suffix: " mo", help: "Months of revenue to project." },
];

export function SimulatorPage() {
  const baseline = useQuery({ queryKey: ["simulator", "baseline"], queryFn: () => api.get<{ data: BaselineDto }>("/simulator/baseline").then((r) => r.data) });
  const [a, setA] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const b = baseline.data;
  const result = useMemo(
    () =>
      b
        ? simulate(
            { mrr: toMinor(b.mrr), activeSubscriptions: b.activeSubscriptions, customers: b.customers, outstanding: toMinor(b.outstanding), overdue: toMinor(b.overdue), collectionRate: b.collectionRate },
            a,
          )
        : null,
    [a, b],
  );

  return (
    <Page>
      <PageHeader
        title="What-if simulator"
        description="Test pricing, churn, discount and collection scenarios before applying them. All maths is deterministic and shown below."
        actions={<Button variant="secondary" onClick={() => setA(DEFAULT_ASSUMPTIONS)}><RotateCcw /> Reset</Button>}
      />
      {!b || !result ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card className="self-start">
            <CardHeader title="Assumptions" />
            <div className="space-y-5 p-5">
              {SLIDERS.map((s) => (
                <label key={s.key} className="block">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-medium text-ink">{s.label}</span>
                    <span className="tabular font-semibold text-primary-ink">{a[s.key] > 0 && s.key === "priceChangePct" ? "+" : ""}{a[s.key]}{s.suffix}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={a[s.key]}
                    onChange={(e) => setA({ ...a, [s.key]: Number(e.target.value) })}
                    className="mt-2 w-full accent-[var(--color-primary)]"
                  />
                  <span className="text-[11px] text-muted">{s.help}</span>
                </label>
              ))}
            </div>
          </Card>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Result label="Projected MRR" value={result.mrr} delta={result.delta.mrr} />
              <Result label="Projected ARR" value={result.arr} delta={result.delta.arr} />
              <Result label={`Revenue over ${a.months} months`} value={result.revenue} delta={result.delta.revenue} />
              <Result label="Expected to be collected" value={result.collected} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-4 text-[13px]"><div className="text-muted">Subscriptions</div><div className="tabular text-lg font-semibold text-ink">{result.subscriptions} <span className="text-[12px] font-normal text-muted">({result.delta.subscriptions >= 0 ? "+" : ""}{result.delta.subscriptions})</span></div></Card>
              <Card className="p-4 text-[13px]"><div className="text-muted">Customers</div><div className="tabular text-lg font-semibold text-ink">{result.customers}</div></Card>
              <Card className="p-4 text-[13px]"><div className="text-muted">Outstanding after recovery</div><div className="tabular text-lg font-semibold text-ink">{money(fromMinor(result.outstanding))}</div></Card>
            </div>
            <Card>
              <CardHeader title="How the MRR is calculated" description="Each step applies to the result of the previous one." />
              <table className="w-full text-[13px]">
                <tbody className="tabular">
                  {result.steps.map((s) => (
                    <tr key={s.label} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 text-ink">{s.label}</td>
                      <td className="px-5 py-2.5 font-mono text-[12px] text-muted">{s.formula}</td>
                      <td className="px-5 py-2.5 text-right text-ink">{money(fromMinor(s.mrr))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {a.priceChangePct > 0 && a.churnPct === 0 && (
              <Alert tone="pending">A price increase does not guarantee customers stay. Add a churn assumption for a realistic scenario.</Alert>
            )}
            <Card>
              <CardHeader title="Baseline by plan" description={`Collection rate over the last 90 days: ${b.collectionRate}%`} />
              <ul className="divide-y divide-line">
                {b.plans.map((p) => (
                  <li key={p.id} className="flex justify-between px-5 py-2.5 text-[13px]"><span className="text-ink">{p.name} <span className="text-muted">· {p.subscriptions} active</span></span><span className="tabular">{money(p.mrr)} MRR</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function Result({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-ink">{money(fromMinor(value))}</div>
      {delta !== undefined && (
        <div className={cn("tabular mt-0.5 text-[12px]", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted")}>
          {delta > 0 ? "+" : ""}{money(fromMinor(delta))} vs today
        </div>
      )}
    </Card>
  );
}
