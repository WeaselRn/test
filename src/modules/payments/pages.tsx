/** PAY-1, PAY-2: payment history, unmatched receipts, outstanding invoices. Owner: Person 3. */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Link2, Plus, Wallet } from "lucide-react";
import { todayISO } from "@shared/dates";
import { PAYMENT_METHODS, paymentSchema } from "@shared/schemas";
import type { Customer, Invoice, Payment } from "@shared/types";
import { AsyncSelect } from "@/components/shared/async-select";
import { Alert, Badge, Button, Card, DataTable, Dialog, EmptyState, Field, Input, Page, PageHeader, Segmented, Select, Stat, Toolbar, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { date, money, titleCase } from "@/lib/utils";
import { invoiceColumns, RecordPaymentDialog } from "../invoices/pages";

type PaymentList = Awaited<ReturnType<typeof api.list<Payment>>> & { totals: { amount: string } };

export function PaymentsPage() {
  const list = useListParams();
  const canWrite = useCan("payment:write");
  const method = list.params.get("method") ?? "";
  const unmatched = list.params.get("unmatched") ?? "";
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState<Payment | null>(null);
  const payments = useQuery({
    queryKey: ["payments", list.query, method, unmatched],
    queryFn: () => api.get<PaymentList>("/payments", { ...list.query, method, unmatched }),
  });
  return (
    <Page>
      <PageHeader
        title="Payments"
        description={payments.data ? `${money(payments.data.totals.amount)} received in this view` : "Every payment recorded against invoices."}
        actions={canWrite && <Button variant="secondary" onClick={() => setAdding(true)}><Plus /> Unmatched receipt</Button>}
      />
      <Card>
        <Toolbar>
          <div className="flex flex-wrap gap-2">
            <Segmented value={unmatched} onChange={(v) => list.set({ unmatched: v })} items={[{ value: "", label: "All" }, { value: "true", label: "Unmatched" }]} />
            <Select value={method} onChange={(e) => list.set({ method: e.target.value })} className="h-8 w-40 text-[13px]" aria-label="Method">
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
            </Select>
          </div>
          <Input placeholder="Search invoice, customer or reference" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            { key: "date", header: "Paid on", sortKey: "paidOn", cell: (p) => date(p.paidOn) },
            { key: "invoice", header: "Invoice", cell: (p) => p.invoiceNumber ?? <Badge tone="accent">Unmatched</Badge> },
            { key: "customer", header: "Customer", cell: (p) => p.customerName ?? "—" },
            { key: "method", header: "Method", hideOnMobile: true, cell: (p) => titleCase(p.method) },
            { key: "ref", header: "Reference", hideOnMobile: true, cell: (p) => p.reference ?? "—" },
            { key: "amount", header: "Amount", sortKey: "amount", align: "right", cell: (p) => money(p.amount) },
            {
              key: "act",
              header: "",
              align: "right",
              cell: (p) => !p.invoiceId && canWrite && <Button size="sm" variant="ghost" onClick={() => setMatching(p)}><Link2 /> Match</Button>,
            },
          ]}
          result={payments.data}
          isLoading={payments.isLoading}
          error={payments.error}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          empty={<EmptyState icon={<CreditCard />} title="No payments" />}
        />
      </Card>
      {adding && <UnmatchedDialog onClose={() => setAdding(false)} />}
      {matching && <MatchDialog payment={matching} onClose={() => setMatching(null)} />}
    </Page>
  );
}

function UnmatchedDialog({ onClose }: { onClose: () => void }) {
  const [customerId, setCustomer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(paymentSchema, { defaultValues: { method: "bank_transfer", amount: "", paidOn: todayISO(), reference: "", note: "" } });
  const save = useAction((v: unknown) => api.post("/payments", v), { success: "Receipt recorded", invalidate: [["payments"]], onSuccess: onClose });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record an unmatched receipt"
      description="Money received that you cannot link to an invoice yet. It shows in Revenue leakage until matched."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="unm-form" loading={save.isPending}>Save</Button></>}
    >
      <form id="unm-form" noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync({ ...v, customerId }).catch((e) => setError(applyServerErrors(form, e))))}>
        {error && <Alert>{error}</Alert>}
        <Field label="Customer (optional)">
          <AsyncSelect<Customer> path="/customers" value={customerId} onChange={(id) => setCustomer(id)} getLabel={(c) => c.companyName || c.contactName} placeholder="Unknown payer" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount (₹)" htmlFor="u-amt" error={errors.amount?.message}><Input id="u-amt" inputMode="decimal" {...form.register("amount")} /></Field>
          <Field label="Date" htmlFor="u-date"><Input id="u-date" type="date" {...form.register("paidOn")} /></Field>
          <Field label="Method" htmlFor="u-m">
            <Select id="u-m" {...form.register("method")}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select>
          </Field>
        </div>
        <Field label="Reference" htmlFor="u-ref"><Input id="u-ref" {...form.register("reference")} /></Field>
      </form>
    </Dialog>
  );
}

function MatchDialog({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const [invoiceId, setInvoice] = useState<string | null>(null);
  const match = useAction(() => api.post(`/payments/${payment.id}/match`, { invoiceId }), { success: "Payment matched", invalidate: [["payments"], ["invoices"], ["findings"]], onSuccess: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Match ${money(payment.amount)} to an invoice`}
      description="Only confirmed invoices with a balance at least this amount can be chosen."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => match.mutate(undefined)} disabled={!invoiceId} loading={match.isPending}>Match payment</Button></>}
    >
      <AsyncSelect<Invoice>
        path="/invoices"
        value={invoiceId}
        onChange={(id) => setInvoice(id)}
        extraQuery={{ outstanding: "true", ...(payment.customerId ? { customerId: payment.customerId } : {}) }}
        getLabel={(i) => `${i.number} · ${i.customerName}`}
        getDetail={(i) => `Balance ${money(i.balance)} · due ${date(i.dueDate)}`}
        placeholder="Choose an open invoice"
      />
    </Dialog>
  );
}

type InvoiceList = Awaited<ReturnType<typeof api.list<Invoice>>> & { totals: { total: string; balance: string } };

export function OutstandingPage() {
  const list = useListParams({ sort: "dueDate" });
  const navigate = useNavigate();
  const canPay = useCan("payment:write");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const overdueOnly = list.params.get("overdue") ?? "";
  const invoices = useQuery({
    queryKey: ["invoices", "outstanding", list.query, overdueOnly],
    queryFn: () => api.get<InvoiceList>("/invoices", { ...list.query, outstanding: "true", overdue: overdueOnly || undefined }),
  });
  const summary = useQuery({ queryKey: ["reports", "summary"], queryFn: () => api.get<{ data: { amountOutstanding: string; overdueInvoices: number; overdueAmount: string } }>("/reports/summary").then((r) => r.data) });
  return (
    <Page>
      <PageHeader title="Outstanding invoices" description="Confirmed invoices with a balance. Overdue rows show days past due." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={summary.data ? money(summary.data.amountOutstanding) : "—"} icon={<Wallet />} />
        <Stat label="Overdue amount" value={summary.data ? money(summary.data.overdueAmount) : "—"} tone="danger" />
        <Stat label="Overdue invoices" value={summary.data?.overdueInvoices ?? "—"} tone="danger" />
      </div>
      <Card>
        <Toolbar>
          <Segmented value={overdueOnly} onChange={(v) => list.set({ overdue: v })} items={[{ value: "", label: "All outstanding" }, { value: "true", label: "Overdue only" }]} />
          <Input placeholder="Search number or customer" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            ...invoiceColumns,
            { key: "pay", header: "", align: "right", cell: (i) => canPay && <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), setPaying(i))}>Record payment</Button> },
          ]}
          result={invoices.data}
          isLoading={invoices.isLoading}
          error={invoices.error}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          empty={<EmptyState icon={<Wallet />} title="Nothing outstanding" description="Every confirmed invoice is paid." />}
        />
      </Card>
      {paying && <RecordPaymentDialog invoice={paying} onClose={() => setPaying(null)} />}
    </Page>
  );
}
