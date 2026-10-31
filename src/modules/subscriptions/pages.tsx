/** SUB-1..3: subscriptions list, detail with lifecycle, create/edit. Owner: Person 1. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Pencil, Plus, Repeat, RotateCcw } from "lucide-react";
import { todayISO } from "@shared/dates";
import type { SubscriptionStatus } from "@shared/lifecycle";
import { nextSubscriptionStatuses } from "@shared/lifecycle";
import type { Customer, Invoice, Subscription, SubscriptionStatusChange } from "@shared/types";
import { AsyncSelect } from "@/components/shared/async-select";
import { cleanLines, LineItemsEditor, type LineDraft } from "@/components/shared/line-items-editor";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Toolbar,
  useListParams,
  type Column,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { usePlans } from "@/lib/lookups";
import { cn, date, dateTime, money, titleCase } from "@/lib/utils";

type SubRow = Subscription & { recurringTotal: string; billingPeriod: string };

export function SubscriptionsPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const plans = usePlans();
  const status = list.params.get("status") ?? "";
  const planId = list.params.get("planId") ?? "";
  const subs = useQuery({
    queryKey: ["subscriptions", list.query, status, planId],
    queryFn: () => api.list<SubRow>("/subscriptions", { ...list.query, status, planId }),
  });

  const columns: Column<SubRow>[] = [
    { key: "number", header: "Number", sortKey: "number", cell: (s) => <span className="font-medium text-ink">{s.number}</span> },
    { key: "customer", header: "Customer", cell: (s) => s.customerName },
    { key: "plan", header: "Plan", hideOnMobile: true, cell: (s) => s.planName },
    { key: "value", header: "Recurring", align: "right", cell: (s) => `${money(s.recurringTotal)} / ${s.billingPeriod.replace("ly", "").replace("dai", "day")}` },
    { key: "start", header: "Start", sortKey: "startDate", hideOnMobile: true, cell: (s) => date(s.startDate) },
    { key: "next", header: "Next invoice", sortKey: "nextInvoiceDate", hideOnMobile: true, cell: (s) => date(s.nextInvoiceDate) },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <Page>
      <PageHeader
        title="Subscriptions"
        description="Every customer subscription and where it is in its lifecycle."
        actions={<Button onClick={() => navigate("/subscriptions/new")}><Plus /> New subscription</Button>}
      />
      <Card>
        <Toolbar>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={status}
              onChange={(v) => list.set({ status: v })}
              items={[
                { value: "", label: "All" },
                { value: "draft,quotation", label: "Quotes" },
                { value: "confirmed", label: "Confirmed" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <Select value={planId} onChange={(e) => list.set({ planId: e.target.value })} className="h-8 w-44 text-[13px]" aria-label="Filter by plan">
              <option value="">All plans</option>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <Input placeholder="Search number or customer" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={columns}
          result={subs.data}
          isLoading={subs.isLoading}
          error={subs.error}
          onRetry={() => subs.refetch()}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(s) => navigate(`/subscriptions/${s.id}`)}
          empty={<EmptyState icon={<Repeat />} title="No subscriptions match" />}
        />
      </Card>
    </Page>
  );
}

type SubDetail = Subscription & {
  lines: (NonNullable<Subscription["lines"]>[number] & { variantName: string | null; taxName: string | null })[];
  plan: { id: string; name: string; price: string; billingPeriod: string; closable: boolean; pausable: boolean; renewable: boolean };
  recurringTotal: string;
  renewedFromId: string | null;
  closedReason: string | null;
  quoteExpired: boolean;
};

const STEPS: SubscriptionStatus[] = ["draft", "quotation", "confirmed", "active", "closed"];

const ACTION_LABEL: Partial<Record<SubscriptionStatus, string>> = {
  quotation: "Send quotation",
  confirmed: "Confirm",
  active: "Activate",
  paused: "Pause",
  closed: "Close",
};

export function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"lines" | "invoices" | "history">("lines");
  const [moving, setMoving] = useState<SubscriptionStatus | null>(null);
  const [note, setNote] = useState("");
  const sub = useQuery({ queryKey: ["subscriptions", id], queryFn: () => api.get<{ data: SubDetail }>(`/subscriptions/${id}`).then((r) => r.data) });
  const history = useQuery({
    queryKey: ["subscriptions", id, "history"],
    queryFn: () => api.get<{ data: SubscriptionStatusChange[] }>(`/subscriptions/${id}/history`).then((r) => r.data),
    enabled: tab === "history",
  });
  const invoices = useQuery({
    queryKey: ["subscriptions", id, "invoices"],
    queryFn: () => api.get<{ data: Invoice[] }>(`/subscriptions/${id}/invoices`).then((r) => r.data),
    enabled: tab === "invoices",
  });
  const transition = useAction((to: SubscriptionStatus) => api.post<{ data: Subscription }>(`/subscriptions/${id}/transition`, { to, note: note || null }), {
    success: (r) => `Subscription is now ${r.data.status}`,
    invalidate: [["subscriptions"]],
    onSuccess: () => {
      setMoving(null);
      setNote("");
    },
  });
  const renew = useAction(() => api.post<{ data: Subscription }>(`/subscriptions/${id}/renew`), {
    success: (r) => `Renewal quotation ${r.data.number} created`,
    invalidate: [["subscriptions"]],
    onSuccess: (r) => navigate(`/subscriptions/${r.data.id}`),
  });

  if (sub.isLoading) return <Page><Skeleton className="h-80" /></Page>;
  if (sub.error || !sub.data) return <Page><ErrorState message={sub.error?.message} /></Page>;
  const s = sub.data;
  const next = nextSubscriptionStatuses(s.status, s.plan).filter((to) => !(to === "active" && s.status === "confirmed" && s.startDate > todayISO()));
  const stepIndex = STEPS.indexOf(s.status === "paused" ? "active" : s.status);

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/subscriptions" className="hover:text-ink">Subscriptions</Link>}
        title={s.number}
        description={<>{s.customerName} · {s.plan.name} · <StatusBadge status={s.quoteExpired ? "expired" : s.status} /></>}
        actions={
          <>
            {(s.status === "draft" || s.status === "quotation") && (
              <Button variant="secondary" onClick={() => navigate(`/subscriptions/${s.id}/edit`)}><Pencil /> Edit</Button>
            )}
            {s.plan.renewable && ["active", "paused", "closed"].includes(s.status) && (
              <Button variant="secondary" onClick={() => renew.mutate(undefined)} loading={renew.isPending}><RotateCcw /> Renew</Button>
            )}
            {s.status === "paused" && <Button onClick={() => setMoving("active")}>Resume</Button>}
            {next
              .filter((to) => !(s.status === "paused" && to === "active"))
              .map((to) => (
                <Button key={to} variant={to === "closed" || to === "paused" ? "secondary" : "primary"} onClick={() => setMoving(to)} disabled={s.quoteExpired && to === "confirmed"}>
                  {ACTION_LABEL[to]}
                </Button>
              ))}
          </>
        }
      />

      <Card className="mb-6 p-5">
        <ol className="grid grid-cols-5 gap-2">
          {STEPS.map((step, i) => {
            const done = i < stepIndex || (s.status === "closed" && i === stepIndex);
            const current = i === stepIndex && s.status !== "closed";
            return (
              <li key={step} className="flex flex-col gap-2">
                <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : current ? "bg-accent" : "bg-line")} />
                <div className={cn("flex items-center gap-1 text-[12px]", current ? "font-medium text-ink" : done ? "text-body" : "text-faint")}>
                  {done && <Check className="size-3 text-primary" />}
                  {titleCase(step)}
                  {current && s.status === "paused" && " (paused)"}
                </div>
              </li>
            );
          })}
        </ol>
        {s.quoteExpired && <div className="mt-4"><Alert tone="pending">This quotation expired on {date(s.quoteValidUntil)} and cannot be confirmed. Create a new quotation.</Alert></div>}
        {s.closedReason && <p className="mt-4 text-[13px] text-muted">Closed: {s.closedReason}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <Tabs value={tab} onChange={setTab} className="px-4" items={[{ value: "lines", label: "Lines" }, { value: "invoices", label: "Invoices" }, { value: "history", label: "History" }]} />
          {tab === "lines" && (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Tax</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="tabular">
                <tr className="border-b border-line">
                  <td className="px-4 py-3 text-ink">{s.plan.name} <span className="text-muted">(plan fee)</span></td>
                  <td className="px-4 py-3 text-right">1</td>
                  <td className="px-4 py-3 text-right">{money(s.plan.price)}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">—</td>
                  <td className="px-4 py-3 text-right">{money(s.plan.price)}</td>
                </tr>
                {s.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line">
                    <td className="px-4 py-3 text-ink">{l.productName}{l.variantName && <span className="text-muted"> · {l.variantName}</span>}</td>
                    <td className="px-4 py-3 text-right">{l.quantity}</td>
                    <td className="px-4 py-3 text-right">{money(l.unitPrice)}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">{l.taxName ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right font-medium text-ink">Recurring total (before discounts)</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(s.recurringTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {tab === "invoices" &&
            (invoices.data?.length ? (
              <ul className="divide-y divide-line">
                {invoices.data.map((inv) => (
                  <li key={inv.id}>
                    <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-subtle/70">
                      <span className="font-medium text-ink">{inv.number}</span>
                      <span className="text-muted">{date(inv.periodStart)} – {date(inv.periodEnd)}</span>
                      <span className="tabular">{money(inv.total)}</span>
                      <StatusBadge status={inv.isOverdue ? "overdue" : inv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={invoices.isLoading ? "Loading…" : "No invoices yet"} description="Invoices appear after the billing run once the subscription is active." />
            ))}
          {tab === "history" && (
            <ol className="space-y-4 p-5">
              {history.data?.map((h) => (
                <li key={h.id} className="flex gap-3 text-[13px]">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <div className="text-ink">
                      {h.fromStatus ? `${titleCase(h.fromStatus)} → ` : "Created as "}
                      <span className="font-medium">{titleCase(h.toStatus)}</span>
                    </div>
                    <div className="text-[12px] text-muted">{dateTime(h.createdAt)} · {h.actorName ?? "System"}{h.note && ` · ${h.note}`}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="self-start p-5">
          <DescriptionList
            className="sm:grid-cols-1 lg:grid-cols-1"
            items={[
              { label: "Customer", value: <Link className="text-primary hover:underline" to={`/customers/${s.customerId}`}>{s.customerName}</Link> },
              { label: "Plan", value: `${s.plan.name} · ${titleCase(s.plan.billingPeriod)}` },
              { label: "Start date", value: date(s.startDate) },
              { label: "Expiry date", value: date(s.expiryDate) },
              { label: "Next invoice", value: date(s.nextInvoiceDate) },
              { label: "Payment terms", value: `${s.paymentTermDays} days` },
              ...(s.quoteValidUntil && (s.status === "quotation" || s.status === "draft") ? [{ label: "Quotation valid until", value: date(s.quoteValidUntil) }] : []),
              ...(s.renewedFromId ? [{ label: "Renewal of", value: <Link className="text-primary hover:underline" to={`/subscriptions/${s.renewedFromId}`}>Previous subscription</Link> }] : []),
              { label: "Plan permits", value: [s.plan.pausable && "pause", s.plan.closable && "early close", s.plan.renewable && "renewal"].filter(Boolean).join(", ") || "No customer actions" },
            ]}
          />
        </Card>
      </div>

      <ConfirmDialog
        open={!!moving}
        onClose={() => setMoving(null)}
        onConfirm={() => moving && transition.mutate(moving)}
        loading={transition.isPending}
        tone={moving === "closed" ? "danger" : "primary"}
        title={moving ? `${ACTION_LABEL[moving] ?? "Move"} ${s.number}?` : ""}
        description={
          moving === "confirmed" && s.startDate <= todayISO()
            ? "The start date has passed, so the subscription becomes Active immediately and billing starts."
            : moving === "closed"
              ? "No further invoices will be generated. This cannot be undone."
              : moving === "quotation"
                ? "The quotation becomes visible to the customer in their portal."
                : undefined
        }
        confirmLabel={moving ? (ACTION_LABEL[moving] ?? "Confirm") : ""}
      />
    </Page>
  );
}

export function SubscriptionFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const sub = useQuery({ queryKey: ["subscriptions", id], queryFn: () => api.get<{ data: SubDetail }>(`/subscriptions/${id}`).then((r) => r.data), enabled: !isNew });
  if (!isNew && sub.isLoading) return <Page><Skeleton className="h-64" /></Page>;
  return <SubscriptionForm sub={isNew ? null : (sub.data ?? null)} />;
}

function SubscriptionForm({ sub }: { sub: SubDetail | null }) {
  const navigate = useNavigate();
  const plans = usePlans({ activeOnly: true });
  const canWrite = useCan("subscription:write");
  const [customerId, setCustomer] = useState(sub?.customerId ?? "");
  const [planId, setPlan] = useState(sub?.planId ?? "");
  const [startDate, setStart] = useState(sub?.startDate ?? todayISO());
  const [expiryDate, setExpiry] = useState(sub?.expiryDate ?? "");
  const [paymentTermDays, setTerms] = useState(sub?.paymentTermDays ?? 15);
  const [lines, setLines] = useState<LineDraft[]>(
    sub?.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice, taxId: l.taxId })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const plan = plans.data?.find((p) => p.id === (planId || plans.data?.[0]?.id));

  const save = useAction(
    () => {
      const body = { customerId, planId: plan?.id, startDate, expiryDate: expiryDate || null, paymentTermDays, lines: cleanLines(lines) };
      return sub ? api.patch<{ data: Subscription }>(`/subscriptions/${sub.id}`, body) : api.post<{ data: Subscription }>("/subscriptions", body);
    },
    { success: "Subscription saved", invalidate: [["subscriptions"]], onSuccess: (r) => navigate(`/subscriptions/${r.data.id}`, { replace: true }) },
  );

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/subscriptions" className="hover:text-ink">Subscriptions</Link>}
        title={sub ? `Edit ${sub.number}` : "New subscription"}
        description="Saved as a draft. Send it as a quotation, then confirm it to start billing."
        actions={
          canWrite && (
            <Button
              loading={save.isPending}
              onClick={() => {
                setErrors({});
                setError(null);
                save.mutate(undefined, { onError: (e) => e instanceof ApiRequestError && (setErrors(e.fields), setError(e.message)) });
              }}
            >
              Save draft
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="space-y-4 self-start p-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Customer" error={errors.customerId}>
            <AsyncSelect<Customer>
              path="/customers"
              value={customerId}
              initialLabel={sub?.customerName}
              onChange={(cid) => setCustomer(cid)}
              getLabel={(c) => c.companyName || c.contactName}
              getDetail={(c) => c.email}
              placeholder="Choose a customer"
              invalid={!!errors.customerId}
            />
          </Field>
          <Field label="Plan" htmlFor="sf-plan" error={errors.planId}>
            <Select id="sf-plan" value={plan?.id ?? ""} onChange={(e) => setPlan(e.target.value)}>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)} {p.billingPeriod}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="sf-start" error={errors.startDate}>
              <Input id="sf-start" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.startDate} />
            </Field>
            <Field label="Expiry date" htmlFor="sf-exp" hint="Optional" error={errors.expiryDate}>
              <Input id="sf-exp" type="date" value={expiryDate ?? ""} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
          </div>
          <Field label="Payment terms (days)" htmlFor="sf-terms" error={errors.paymentTermDays}>
            <Input id="sf-terms" type="number" min={0} value={paymentTermDays} onChange={(e) => setTerms(Number(e.target.value))} />
          </Field>
        </Card>
        <Card>
          <CardHeader
            title="Product lines"
            description={plan ? `${plan.name} fee of ${money(plan.price)} is billed as its own line. Minimum quantity ${plan.minQuantity}.` : undefined}
          />
          <div className="p-5">
            <LineItemsEditor value={lines} onChange={setLines} errors={errors} withPricing minQuantity={plan?.minQuantity ?? 1} />
          </div>
        </Card>
      </div>
    </Page>
  );
}
