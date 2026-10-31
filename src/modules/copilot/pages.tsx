/** Optional AI Finance Copilot. Owner: Person 1. */
import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Page, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

interface CopilotAnswer {
  supported: boolean;
  title?: string;
  text: string;
  source?: "ai" | "rules";
  figures?: { label: string; value: string }[];
  rows?: { label: string; detail: string; href: string }[];
  suggestions?: string[];
}

export function CopilotPage() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{ q: string; a: CopilotAnswer }[]>([]);
  const status = useQuery({ queryKey: ["ai", "status"], queryFn: () => api.get<{ enabled: boolean; provider: string | null; suggestions: string[] }>("/ai/status") });
  const ask = useMutation({
    mutationFn: (q: string) => api.post<{ data: CopilotAnswer }>("/ai/ask", { question: q }).then((r) => r.data),
    onSuccess: (a, q) => {
      setHistory((h) => [{ q, a }, ...h]);
      setQuestion("");
    },
  });
  const submit = (q: string) => q.trim().length >= 3 && ask.mutate(q.trim());

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Finance copilot"
        description="Ask about overdue invoices, revenue, renewals, leakage, at-risk customers or MRR. Figures always come from the database."
        actions={<Badge tone={status.data?.enabled ? "success" : "accent"}>{status.data?.enabled ? `AI: ${status.data.provider}` : "Rules mode (no AI key)"}</Badge>}
      />
      <Card className="p-4">
        <form onSubmit={(e) => (e.preventDefault(), submit(question))} className="flex gap-2">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which customers have overdue invoices above ₹10,000?" />
          <Button type="submit" loading={ask.isPending}><Sparkles /> Ask</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {status.data?.suggestions.map((s) => (
            <button key={s} onClick={() => submit(s)} className="rounded-full border border-line bg-subtle px-3 py-1 text-[12px] text-body hover:border-primary hover:text-primary-ink">
              {s}
            </button>
          ))}
        </div>
      </Card>
      {ask.error && <div className="mt-4"><Alert>{ask.error.message}</Alert></div>}
      {ask.isPending && <div className="mt-6 flex items-center gap-2 text-[13px] text-muted"><Spinner /> Looking up the figures…</div>}
      <div className="mt-6 space-y-4">
        {history.map(({ q, a }, i) => (
          <Card key={i} className="p-5">
            <p className="text-[12px] text-muted">{q}</p>
            {a.title && <h3 className="mt-1 text-[15px] font-semibold">{a.title}</h3>}
            <p className="mt-2 text-[14px] leading-relaxed text-ink">{a.text}</p>
            {a.figures && (
              <div className="mt-4 flex flex-wrap gap-3">
                {a.figures.map((f) => (
                  <div key={f.label} className="rounded-lg bg-subtle px-3 py-2">
                    <div className="text-[11px] text-muted">{f.label}</div>
                    <div className="tabular text-[15px] font-semibold text-ink">{f.value}</div>
                  </div>
                ))}
              </div>
            )}
            {!!a.rows?.length && (
              <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
                {a.rows.map((r, j) => (
                  <li key={j}>
                    <Link to={r.href} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-subtle">
                      <span><span className="font-medium text-ink">{r.label}</span> <span className="text-muted">— {r.detail}</span></span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {a.source && <p className="mt-3 text-[11px] text-faint">{a.source === "ai" ? "Worded by AI from database figures." : "Answer generated from rules; no AI used."}</p>}
          </Card>
        ))}
      </div>
    </Page>
  );
}
