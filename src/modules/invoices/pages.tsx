/** INV-3: invoice list, detail, actions, print. Owner: Person 3. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Pencil, Printer, Send, Wallet } from "lucide-react";
import { todayISO } from "@shared/dates";
import { PAYMENT_METHODS, paymentSchema } from "@shared/schemas";
import type { Invoice, Payment } from "@shared/types";
import { InvoiceDocument, type InvoiceDetail } from "@/components/shared/invoice-document";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
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
  Textarea,
  Toolbar,
  useListParams,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { date, money, titleCase } from "@/lib/utils";

type ListResult = Awaited<ReturnType<typeof api.list<Invoice>>> & { totals: { total: string; balance: string } };

export const invoiceColumns: Column<Invoice>[] = [
  { key: "number", header: "Number", sortKey: "number", cell: (i) => <span className="font-medium text-ink">{i.number}</span> },
  { key: "customer", header: "Customer", cell: (i) => i.customerName },
  { key: "issue", header: "Issued", sortKey: "issueDate", hideOnMobile: true, cell: (i) => date(i.issueDate) },
  { key: "due", header: "Due", sortKey: "dueDate", cell: (i) => <span className={i.isOverdue ? "text-danger" : ""}>{date(i.dueDate)}{i.isOverdue && ` · ${i.daysOverdue}d`}</span> },
  { key: "total", header: "Total", sortKey: "total", align: "right", cell: (i) => money(i.total) },
  { key: "balance", header: "Balance", align: "right", cell: (i) => money(i.balance) },
  { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.isOverdue ? "overdue" : i.status} /> },
];

export function InvoicesPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const filter = list.params.get("filter") ?? "";
  const status = list.params.get("status") ?? "";
  const invoices = useQuery({
    queryKey: ["invoices", list.query, filter, status],
    queryFn: () =>
      api.get<ListResult>("/invoices", { ...list.query, status, overdue: filter === "overdue" ? "true" : undefined, outstanding: filter === "outstanding" ? "true" : undefined }),
  });
  const drafts = (invoices.data?.data ?? []).filter((i) => i.status === "draft");
  const confirmAll = useAction(() => api.post<{ data: { confirmed: number } }>("/invoices/confirm-drafts", { ids: drafts.map((d) => d.id) }), {
    success: (r) => `${r.data.confirmed} invoice(s) confirmed`,
    invalidate: [["invoices"]],
  });
  const seg = filter || status;

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description={invoices.data ? `${money(invoices.data.totals.total)} invoiced · ${money(invoices.data.totals.balance)} outstanding in this view` : "Invoices created by the billing run."}
        actions={
          status === "draft" && drafts.length > 0 && (
            <Button onClick={() => confirmAll.mutate(undefined)} loading={confirmAll.isPending}>Confirm {drafts.length} drafts on this page</Button>
          )
        }
      />
      <Card>
        <Toolbar>
          <Segmented
            value={seg}
            onChange={(v) => list.set(v === "overdue" || v === "outstanding" ? { filter: v, status: null } : { status: v, filter: null })}
            items={[
              { value: "", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "confirmed", label: "Confirmed" },
              { value: "overdue", label: "Overdue" },
              { value: "paid", label: "Paid" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <Input placeholder="Search number or customer" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={invoiceColumns}
          result={invoices.data}
          isLoading={invoices.isLoading}
          error={invoices.error}
          onRetry={() => invoices.refetch()}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          empty={<EmptyState icon={<FileText />} title="No invoices" description="Run billing to generate invoices from active subscriptions." />}
        />
      </Card>
    </Page>
  );
}

type FullInvoice = InvoiceDetail & { payments: Payment[]; confirmedAt: string | null };

export function InvoiceDetailPage() {
  const { id } = useParams();
  const canWrite = useCan("invoice:write");
  const canPay = useCan("payment:write");
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"confirm" | "cancel" | "send" | null>(null);
  const inv = useQuery({ queryKey: ["invoices", id], queryFn: () => api.get<{ data: FullInvoice }>(`/invoices/${id}`).then((r) => r.data) });
  const act = useAction((a: "confirm" | "cancel" | "send") => api.post<{ data: Invoice }>(`/invoices/${id}/${a}`, a === "cancel" ? {} : undefined), {
    success: (r) => `Invoice ${r.data.number} ${r.data.status === "cancelled" ? "cancelled" : r.data.sentAt ? "sent" : "confirmed"}`,
    invalidate: [["invoices"], ["reports"]],
    onSuccess: () => setConfirming(null),
  });

  if (inv.isLoading) return <Page><Skeleton className="h-96" /></Page>;
  if (inv.error || !inv.data) return <Page><ErrorState message={inv.error?.message} /></Page>;
  const i = inv.data;

  return (
    <Page>
      <div className="no-print">
        <PageHeader
          eyebrow={<Link to="/invoices" className="hover:text-ink">Invoices</Link>}
          title={i.number}
          description={<>{i.customerName} · <Link className="text-primary hover:underline" to={`/subscriptions/${i.subscriptionId}`}>{i.subscriptionNumber}</Link>{i.sentAt && ` · sent ${date(i.sentAt)}`}</>}
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()}><Printer /> Print / PDF</Button>
              {canWrite && i.status === "draft" && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
              {canWrite && (i.status === "draft" || i.status === "confirmed") && Number(i.amountPaid) === 0 && (
                <Button variant="secondary" onClick={() => setConfirming("cancel")}>Cancel invoice</Button>
              )}
              {canWrite && i.status !== "cancelled" && <Button variant="secondary" onClick={() => setConfirming("send")}><Send /> Send</Button>}
              {canWrite && i.status === "draft" && <Button onClick={() => setConfirming("confirm")}>Confirm</Button>}
              {canPay && i.status === "confirmed" && <Button onClick={() => setPaying(true)}><Wallet /> Record payment</Button>}
            </>
          }
        />
        {i.status === "draft" && <div className="mb-4"><Alert tone="pending">Draft invoices are editable and not visible to the customer. Confirm to lock the invoice and start the due date.</Alert></div>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <InvoiceDocument invoice={i} />
        <Card className="no-print self-start">
          <CardHeader title="Payments" description={`${money(i.amountPaid)} of ${money(i.total)} received`} />
          {i.payments.length ? (
            <ul className="divide-y divide-line">
              {i.payments.map((p) => (
                <li key={p.id} className="px-5 py-3 text-[13px]">
                  <div className="flex justify-between"><span className="tabular font-medium text-ink">{money(p.amount)}</span><span className="text-muted">{date(p.paidOn)}</span></div>
                  <div className="text-[12px] text-muted">{titleCase(p.method)}{p.reference && ` · ${p.reference}`}{p.note && ` · ${p.note}`}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-[13px] text-muted">No payments yet. Several partial payments can settle one invoice.</p>
          )}
        </Card>
      </div>
      {paying && <RecordPaymentDialog invoice={i} onClose={() => setPaying(false)} />}
      {editing && <EditDraftDialog invoice={i} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && act.mutate(confirming)}
        loading={act.isPending}
        tone={confirming === "cancel" ? "danger" : "primary"}
        title={confirming === "cancel" ? `Cancel ${i.number}?` : confirming === "send" ? `Send ${i.number} to the customer?` : `Confirm ${i.number}?`}
        description={
          confirming === "cancel"
            ? "The invoice stops counting as outstanding and any discount usage is released. This cannot be undone."
            : confirming === "send"
              ? `Emails ${i.customer.email ?? "the customer"} (simulated in demo mode).${i.status === "draft" ? " The invoice is confirmed first." : ""}`
              : "Confirmed invoices are locked; the due date is set from today plus the payment terms."
        }
        confirmLabel={confirming === "cancel" ? "Cancel invoice" : confirming === "send" ? "Send" : "Confirm"}
      />
    </Page>
  );
}

export function RecordPaymentDialog({ invoice, onClose }: { invoice: Pick<Invoice, "id" | "number" | "balance">; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(paymentSchema, { defaultValues: { method: "bank_transfer", amount: invoice.balance, paidOn: todayISO(), reference: "", note: "" } });
  const save = useAction((v: unknown) => api.post(`/invoices/${invoice.id}/payments`, v), {
    success: "Payment recorded",
    invalidate: [["invoices"], ["payments"], ["reports"]],
    onSuccess: onClose,
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record payment · ${invoice.number}`}
      description={`Balance ${money(invoice.balance)}. Partial payments are allowed.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pay-form" loading={save.isPending}>Record payment</Button>
        </>
      }
    >
      <form id="pay-form" noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).catch((e) => setError(applyServerErrors(form, e))))}>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="pay-amt" error={errors.amount?.message}>
            <Input id="pay-amt" inputMode="decimal" aria-invalid={!!errors.amount} {...form.register("amount")} />
          </Field>
          <Field label="Payment date" htmlFor="pay-date" error={errors.paidOn?.message}>
            <Input id="pay-date" type="date" {...form.register("paidOn")} />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" {...form.register("method")}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="pay-ref" hint="UTR, cheque or card reference">
            <Input id="pay-ref" {...form.register("reference")} />
          </Field>
        </div>
        <Field label="Note" htmlFor="pay-note">
          <Textarea id="pay-note" {...form.register("note")} />
        </Field>
      </form>
    </Dialog>
  );
}

function EditDraftDialog({ invoice, onClose }: { invoice: FullInvoice; onClose: () => void }) {
  const [lines, setLines] = useState(invoice.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })));
  const [dueDate, setDue] = useState(invoice.dueDate);
  const save = useAction(() => api.patch(`/invoices/${invoice.id}`, { dueDate, lines }), { success: "Draft updated", invalidate: [["invoices"]], onSuccess: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit draft ${invoice.number}`}
      description="Taxes and totals are recalculated from the lines."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>Save draft</Button>
        </>
      }
    >
      <div className="space-y-3">
        {lines.map((l, idx) => (
          <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_80px_120px]">
            <Input aria-label="Description" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, description: e.target.value } : x)))} />
            <Input aria-label="Quantity" type="number" min={1} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
            <Input aria-label="Unit price" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === idx ? { ...x, unitPrice: e.target.value } : x)))} />
          </div>
        ))}
        <Field label="Due date" htmlFor="ed-due">
          <Input id="ed-due" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
