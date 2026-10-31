/** PORT-1, PORT-2: customer self-service portal. Owner: Person 4. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, FileText, Printer, Repeat } from "lucide-react";
import type { Invoice, Payment, Subscription } from "@shared/types";
import { InvoiceDocument, type InvoiceDetail } from "@/components/shared/invoice-document";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Stat,
  StatusBadge,
  Textarea,
  useListParams,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { date, money, titleCase } from "@/lib/utils";

type PortalSub = Subscription & { billingPeriod: string; planPrice: string; pausable: boolean; closable: boolean; renewable: boolean };

export function PortalOverviewPage() {
  const { user } = useSession();
  const summary = useQuery({
    queryKey: ["portal", "summary"],
    queryFn: () => api.get<{ data: { activeSubscriptions: number; outstanding: string; overdueInvoices: number; nextDueDate: string | null; totalPaid: string } }>("/portal/summary").then((r) => r.data),
  });
  const invoices = useQuery({ queryKey: ["portal", "invoices", "open"], queryFn: () => api.list<Invoice>("/portal/invoices", { outstanding: "true", pageSize: 5 }) });
  const quotes = useQuery({ queryKey: ["portal", "subscriptions", "quotes"], queryFn: () => api.list<PortalSub>("/portal/subscriptions", { pageSize: 50 }) });
  const s = summary.data;
  const openQuotes = quotes.data?.data.filter((q) => q.status === "quotation") ?? [];
  return (
    <Page>
      <PageHeader title={`Welcome, ${user?.name.split(" ")[0]}`} description="Your subscriptions, invoices and payments in one place." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active subscriptions" value={s?.activeSubscriptions ?? "—"} icon={<Repeat />} />
        <Stat label="Balance due" value={s ? money(s.outstanding) : "—"} detail={s?.nextDueDate ? `Next due ${date(s.nextDueDate)}` : "Nothing due"} />
        <Stat label="Overdue invoices" value={s?.overdueInvoices ?? "—"} tone={s?.overdueInvoices ? "danger" : undefined} />
        <Stat label="Total paid" value={s ? money(s.totalPaid) : "—"} tone="success" />
      </div>
      {openQuotes.length > 0 && (
        <Card className="mb-6 border-accent/30 bg-accent-soft/50 p-4">
          <div className="text-[13px] font-semibold text-accent-ink">You have {openQuotes.length} quotation(s) waiting for your decision</div>
          <ul className="mt-2 space-y-1">
            {openQuotes.map((q) => (
              <li key={q.id}><Link to={`/portal/subscriptions/${q.id}`} className="text-[13px] text-primary hover:underline">{q.number} · {q.planName} · valid until {date(q.quoteValidUntil)}</Link></li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Invoices to pay" action={<Link to="/portal/invoices" className="text-[12px] font-medium text-primary hover:underline">All invoices</Link>} />
        {invoices.data?.data.length ? (
          <ul className="divide-y divide-line">
            {invoices.data.data.map((i) => (
              <li key={i.id}>
                <Link to={`/portal/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px] hover:bg-subtle/70">
                  <span><span className="font-medium text-ink">{i.number}</span> <span className="text-muted">· due {date(i.dueDate)}</span></span>
                  <span className="flex items-center gap-3"><span className="tabular">{money(i.balance)}</span><StatusBadge status={i.isOverdue ? "overdue" : i.status} /><ArrowRight className="size-3.5 text-muted" /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="You're all paid up" description="No open invoices." />
        )}
      </Card>
    </Page>
  );
}

export function PortalSubscriptionsPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const subs = useQuery({ queryKey: ["portal", "subscriptions", list.page], queryFn: () => api.list<PortalSub>("/portal/subscriptions", { page: list.page }) });
  return (
    <Page>
      <PageHeader title="My subscriptions" />
      <Card>
        <DataTable
          columns={[
            { key: "num", header: "Number", cell: (s) => <span className="font-medium text-ink">{s.number}</span> },
            { key: "plan", header: "Plan", cell: (s) => `${s.planName} · ${money(s.planPrice)} ${s.billingPeriod}` },
            { key: "start", header: "Started", hideOnMobile: true, cell: (s) => date(s.startDate) },
            { key: "next", header: "Next invoice", hideOnMobile: true, cell: (s) => date(s.nextInvoiceDate) },
            { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
          ]}
          result={subs.data}
          isLoading={subs.isLoading}
          error={subs.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(s) => navigate(`/portal/subscriptions/${s.id}`)}
          empty={<EmptyState icon={<Repeat />} title="No subscriptions yet" />}
        />
      </Card>
    </Page>
  );
}

type PortalSubDetail = Subscription & {
  lines: { id: string; productName?: string; variantName: string | null; quantity: number; unitPrice: string; amount: string }[];
  plan: { name: string; price: string; billingPeriod: string; pausable: boolean; closable: boolean; renewable: boolean };
  recurringTotal: string;
  quoteExpired: boolean;
  invoices: Invoice[];
};

export function PortalSubscriptionDetailPage() {
  const { id } = useParams();
  const [action, setAction] = useState<"pause" | "resume" | "renew" | "accept" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const sub = useQuery({ queryKey: ["portal", "subscriptions", id], queryFn: () => api.get<{ data: PortalSubDetail }>(`/portal/subscriptions/${id}`).then((r) => r.data) });
  const act = useAction((a: string) => api.post<{ data: Subscription }>(`/portal/subscriptions/${id}/${a}`), {
    success: (r) => (action === "renew" ? `Renewal quotation ${r.data.number} requested` : "Done"),
    invalidate: [["portal"]],
    onSuccess: () => setAction(null),
  });
  if (sub.isLoading) return <Page><Skeleton className="h-80" /></Page>;
  if (sub.error || !sub.data) return <Page><ErrorState message={sub.error?.message} /></Page>;
  const s = sub.data;
  const live = s.status === "active" || s.status === "paused";

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/portal/subscriptions" className="hover:text-ink">My subscriptions</Link>}
        title={`${s.plan.name} · ${s.number}`}
        description={<StatusBadge status={s.quoteExpired ? "expired" : s.status} />}
        actions={
          <>
            {s.status === "quotation" && !s.quoteExpired && <Button onClick={() => setAction("accept")}>Accept quotation</Button>}
            {s.status === "active" && s.plan.pausable && <Button variant="secondary" onClick={() => setAction("pause")}>Pause</Button>}
            {s.status === "paused" && <Button onClick={() => setAction("resume")}>Resume</Button>}
            {s.plan.renewable && live && <Button variant="secondary" onClick={() => setAction("renew")}>Request renewal</Button>}
            {live && <Button variant="ghost" onClick={() => setCancelling(true)}>Cancel subscription</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="What you pay" description={`${money(s.recurringTotal)} per ${s.plan.billingPeriod.replace("ly", "").replace("dai", "day")} before discounts`} />
          <ul className="divide-y divide-line text-[13px]">
            <li className="flex justify-between px-5 py-3"><span className="text-ink">{s.plan.name} plan fee</span><span className="tabular">{money(s.plan.price)}</span></li>
            {s.lines.map((l) => (
              <li key={l.id} className="flex justify-between px-5 py-3"><span className="text-ink">{l.productName}{l.variantName && ` · ${l.variantName}`} × {l.quantity}</span><span className="tabular">{money(l.amount)}</span></li>
            ))}
          </ul>
          <CardHeader title="Invoices" className="border-t" />
          {s.invoices.length ? (
            <ul className="divide-y divide-line">
              {s.invoices.map((i) => (
                <li key={i.id}><Link to={`/portal/invoices/${i.id}`} className="flex justify-between px-5 py-3 text-[13px] hover:bg-subtle/70"><span className="text-ink">{i.number} · {date(i.periodStart)}</span><StatusBadge status={i.isOverdue ? "overdue" : i.status} /></Link></li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[13px] text-muted">No invoices yet.</p>
          )}
        </Card>
        <Card className="self-start p-5">
          <DescriptionList
            className="sm:grid-cols-1 lg:grid-cols-1"
            items={[
              { label: "Started", value: date(s.startDate) },
              { label: "Expires", value: date(s.expiryDate) },
              { label: "Next invoice", value: date(s.nextInvoiceDate) },
              { label: "Payment terms", value: `${s.paymentTermDays} days` },
              ...(s.quoteValidUntil && s.status === "quotation" ? [{ label: "Quotation valid until", value: date(s.quoteValidUntil) }] : []),
              { label: "Your plan allows", value: [s.plan.pausable && "pausing", s.plan.closable && "early cancellation", s.plan.renewable && "renewal"].filter(Boolean).join(", ") || "No self-service changes" },
            ]}
          />
        </Card>
      </div>
      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        onConfirm={() => action && act.mutate(action)}
        loading={act.isPending}
        title={action === "pause" ? "Pause this subscription?" : action === "resume" ? "Resume this subscription?" : action === "renew" ? "Request a renewal?" : "Accept this quotation?"}
        description={
          action === "pause"
            ? "You will not be billed while paused. Resume any time."
            : action === "renew"
              ? "We'll prepare a renewal quotation for the next term."
              : action === "accept"
                ? "Your subscription starts on the start date and invoices follow the plan's billing frequency."
                : "Billing restarts from the next period."
        }
        confirmLabel={action ? titleCase(action === "accept" ? "accept" : action) : ""}
      />
      {cancelling && <CancellationFlow subscriptionId={s.id} onClose={() => setCancelling(false)} />}
    </Page>
  );
}

const REASONS = [
  { value: "too_expensive", label: "It's too expensive" },
  { value: "temporary", label: "I only need a break" },
  { value: "missing_features", label: "It's missing features I need" },
  { value: "not_using", label: "I'm not using it enough" },
  { value: "other", label: "Something else" },
];

/** Smart cancellation: reason → one fair alternative → customer decides. Never blocks cancelling. */
function CancellationFlow({ subscriptionId, onClose }: { subscriptionId: string; onClose: () => void }) {
  const [reason, setReason] = useState("too_expensive");
  const [comment, setComment] = useState("");
  const [offer, setOffer] = useState<{ requestId: string; alternative: { type: string; label: string; description: string } | null } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const request = useAction(() => api.post<{ data: NonNullable<typeof offer> }>(`/portal/subscriptions/${subscriptionId}/cancellation-request`, { reason, comment: comment || null }), {
    onSuccess: (r) => setOffer(r.data),
  });
  const resolve = useAction((decision: string) => api.post<{ data: { message: string } }>(`/portal/cancellation-requests/${offer!.requestId}/resolve`, { decision }), {
    invalidate: [["portal"]],
    onSuccess: (r) => setDone(r.data.message),
  });

  if (done) {
    return (
      <Dialog open onClose={onClose} title="All set" footer={<Button onClick={onClose}>Close</Button>}>
        <Alert tone="success">{done}</Alert>
      </Dialog>
    );
  }
  if (offer) {
    return (
      <Dialog
        open
        onClose={() => resolve.mutate("keep")}
        title={offer.alternative ? "Before you go" : "Confirm cancellation"}
        description={offer.alternative ? "Based on your reason, this might work better. Your choice either way." : "We're sorry to see you go."}
        footer={
          <>
            <Button variant="secondary" onClick={() => resolve.mutate("keep")}>Keep my subscription</Button>
            <Button variant="danger" onClick={() => resolve.mutate("cancel")} loading={resolve.isPending && resolve.variables === "cancel"}>Cancel subscription</Button>
            {offer.alternative && <Button onClick={() => resolve.mutate("accept_alternative")} loading={resolve.isPending && resolve.variables === "accept_alternative"}>{offer.alternative.label}</Button>}
          </>
        }
      >
        {offer.alternative && (
          <div className="rounded-lg border border-primary/20 bg-primary-soft p-4">
            <div className="text-[14px] font-semibold text-primary-ink">{offer.alternative.label}</div>
            <p className="mt-1 text-[13px] text-body">{offer.alternative.description}</p>
          </div>
        )}
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel subscription"
      description="Tell us why so we can improve. You can still cancel on the next step."
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button onClick={() => request.mutate(undefined)} loading={request.isPending}>Continue</Button></>}
    >
      <div className="space-y-4">
        <Field label="Main reason" htmlFor="cx-reason">
          <Select id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Anything else? (optional)" htmlFor="cx-comment">
          <Textarea id="cx-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function PortalInvoicesPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const invoices = useQuery({ queryKey: ["portal", "invoices", list.page], queryFn: () => api.list<Invoice>("/portal/invoices", { page: list.page }) });
  return (
    <Page>
      <PageHeader title="My invoices" />
      <Card>
        <DataTable
          columns={[
            { key: "num", header: "Invoice", cell: (i) => <span className="font-medium text-ink">{i.number}</span> },
            { key: "period", header: "Period", hideOnMobile: true, cell: (i) => `${date(i.periodStart)} – ${date(i.periodEnd)}` },
            { key: "due", header: "Due", cell: (i) => date(i.dueDate) },
            { key: "total", header: "Total", align: "right", cell: (i) => money(i.total) },
            { key: "bal", header: "Balance", align: "right", cell: (i) => money(i.balance) },
            { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.isOverdue ? "overdue" : i.status} /> },
          ]}
          result={invoices.data}
          isLoading={invoices.isLoading}
          error={invoices.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(i) => navigate(`/portal/invoices/${i.id}`)}
          empty={<EmptyState icon={<FileText />} title="No invoices yet" />}
        />
      </Card>
    </Page>
  );
}

export function PortalInvoiceDetailPage() {
  const { id } = useParams();
  const inv = useQuery({ queryKey: ["portal", "invoices", id], queryFn: () => api.get<{ data: InvoiceDetail & { payments: Payment[] } }>(`/portal/invoices/${id}`).then((r) => r.data) });
  if (inv.isLoading) return <Page><Skeleton className="h-96" /></Page>;
  if (inv.error || !inv.data) return <Page><ErrorState message={inv.error?.message} /></Page>;
  return (
    <Page>
      <div className="no-print">
        <PageHeader
          eyebrow={<Link to="/portal/invoices" className="hover:text-ink">My invoices</Link>}
          title={inv.data.number}
          actions={<Button variant="secondary" onClick={() => window.print()}><Printer /> Print / PDF</Button>}
        />
        {Number(inv.data.balance) > 0 && inv.data.status === "confirmed" && (
          <div className="mb-4"><Alert tone={inv.data.isOverdue ? "danger" : "pending"}>Balance of {money(inv.data.balance)} is due {date(inv.data.dueDate)}. Pay by bank transfer or UPI quoting {inv.data.number}; our team records payments within one working day.</Alert></div>
        )}
      </div>
      <InvoiceDocument invoice={inv.data} />
    </Page>
  );
}

export function PortalPaymentsPage() {
  const list = useListParams();
  const payments = useQuery({ queryKey: ["portal", "payments", list.page], queryFn: () => api.list<Payment>("/portal/payments", { page: list.page }) });
  return (
    <Page>
      <PageHeader title="My payments" />
      <Card>
        <DataTable
          columns={[
            { key: "date", header: "Date", cell: (p) => date(p.paidOn) },
            { key: "inv", header: "Invoice", cell: (p) => (p.invoiceId ? <Link className="text-primary hover:underline" to={`/portal/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link> : "—") },
            { key: "method", header: "Method", cell: (p) => titleCase(p.method) },
            { key: "ref", header: "Reference", hideOnMobile: true, cell: (p) => p.reference ?? "—" },
            { key: "amount", header: "Amount", align: "right", cell: (p) => money(p.amount) },
          ]}
          result={payments.data}
          isLoading={payments.isLoading}
          error={payments.error}
          onPage={(page) => list.set({ page }, false)}
          empty={<EmptyState icon={<CreditCard />} title="No payments yet" />}
        />
      </Card>
    </Page>
  );
}

export function PortalProfilePage() {
  const profile = useQuery({ queryKey: ["portal", "profile"], queryFn: () => api.get<{ data: { contactName: string; email: string; companyName: string | null; phone: string | null; billingAddress: string | null; taxId: string | null } }>("/portal/profile").then((r) => r.data) });
  if (!profile.data) return <Page><Skeleton className="h-64" /></Page>;
  return <ProfileForm initial={profile.data} />;
}

function ProfileForm({ initial }: { initial: { contactName: string; email: string; companyName: string | null; phone: string | null; billingAddress: string | null; taxId: string | null } }) {
  const [v, setV] = useState({ ...initial, companyName: initial.companyName ?? "", phone: initial.phone ?? "", billingAddress: initial.billingAddress ?? "", taxId: initial.taxId ?? "" });
  const save = useAction(() => api.patch("/portal/profile", v), { success: "Profile updated", invalidate: [["portal", "profile"]] });
  return (
    <Page className="max-w-2xl">
      <PageHeader title="Profile" description="Billing details printed on your invoices." />
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="pp-name"><Input id="pp-name" value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} /></Field>
          <Field label="Email" htmlFor="pp-email" hint="Contact us to change your login email."><Input id="pp-email" value={v.email} disabled /></Field>
          <Field label="Company" htmlFor="pp-co"><Input id="pp-co" value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="pp-phone"><Input id="pp-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        </div>
        <Field label="Billing address" htmlFor="pp-addr"><Textarea id="pp-addr" value={v.billingAddress} onChange={(e) => setV({ ...v, billingAddress: e.target.value })} /></Field>
        <Field label="Tax ID (GSTIN)" htmlFor="pp-tax"><Input id="pp-tax" value={v.taxId} onChange={(e) => setV({ ...v, taxId: e.target.value })} /></Field>
        <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save profile</Button>
      </Card>
    </Page>
  );
}
