/** Customer directory and Customer 360° profile with timeline and notes. Owner: Person 4. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Users } from "lucide-react";
import { customerSchema, type CustomerInput } from "@shared/schemas";
import type { Customer, Invoice, Subscription } from "@shared/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Page,
  PageHeader,
  Skeleton,
  Stat,
  StatusBadge,
  Tabs,
  Textarea,
  Toolbar,
  useListParams,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { cn, date, dateTime, money } from "@/lib/utils";
import { HealthMeter, type Health } from "../customer-health/pages";

type CustomerRow = Customer & { activeSubscriptions: number; outstanding: string; hasPortalAccess: boolean };

export function CustomersPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const canWrite = useCan("customer:write");
  const [creating, setCreating] = useState(false);
  const customers = useQuery({ queryKey: ["customers", list.query], queryFn: () => api.list<CustomerRow>("/customers", list.query) });
  return (
    <Page>
      <PageHeader
        title="Customers"
        description="Every customer with their subscriptions, balance and portal access."
        actions={canWrite && <Button onClick={() => setCreating(true)}><Plus /> New customer</Button>}
      />
      <Card>
        <Toolbar>
          <span className="text-[13px] text-muted">{customers.data ? `${customers.data.total.toLocaleString("en-IN")} customers` : ""}</span>
          <Input placeholder="Search name, company or email" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            {
              key: "name",
              header: "Customer",
              sortKey: "companyName",
              cell: (c) => (
                <div>
                  <div className="font-medium text-ink">{c.companyName || c.contactName}</div>
                  <div className="text-[12px] text-muted">{c.companyName ? c.contactName : c.email}</div>
                </div>
              ),
            },
            { key: "email", header: "Email", hideOnMobile: true, cell: (c) => c.email },
            { key: "subs", header: "Active subs", align: "right", cell: (c) => c.activeSubscriptions },
            { key: "out", header: "Outstanding", align: "right", cell: (c) => money(c.outstanding) },
            { key: "portal", header: "Portal", hideOnMobile: true, cell: (c) => (c.hasPortalAccess ? <Badge tone="success">Has login</Badge> : <Badge>No login</Badge>) },
          ]}
          result={customers.data}
          isLoading={customers.isLoading}
          error={customers.error}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={<EmptyState icon={<Users />} title="No customers found" />}
        />
      </Card>
      {creating && <CustomerDialog onClose={() => setCreating(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} />}
    </Page>
  );
}

export function CustomerDialog({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(customerSchema, {
    defaultValues: customer
      ? { contactName: customer.contactName, email: customer.email, companyName: customer.companyName ?? "", phone: customer.phone ?? "", billingAddress: customer.billingAddress ?? "", taxId: customer.taxId ?? "" }
      : { contactName: "", email: "", companyName: "", phone: "", billingAddress: "", taxId: "" },
  });
  const save = useAction((v: CustomerInput) => (customer ? api.patch<{ data: Customer }>(`/customers/${customer.id}`, v) : api.post<{ data: Customer }>("/customers", v)), {
    success: "Customer saved",
    invalidate: [["customers"], ["async-select"]],
    onSuccess: (r) => {
      onClose();
      onSaved?.(r.data);
    },
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onClose={onClose}
      title={customer ? "Edit customer" : "New customer"}
      description={customer ? undefined : "If they sign up later with the same email, their portal login links to this record."}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cust-form" loading={save.isPending}>Save</Button></>}
    >
      <form id="cust-form" noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).catch((e) => setError(applyServerErrors(form, e))))}>
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <Field label="Contact name" htmlFor="c-name" error={errors.contactName?.message}><Input id="c-name" {...form.register("contactName")} /></Field>
        <Field label="Company" htmlFor="c-co"><Input id="c-co" {...form.register("companyName")} /></Field>
        <Field label="Email" htmlFor="c-email" error={errors.email?.message}><Input id="c-email" type="email" {...form.register("email")} /></Field>
        <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" {...form.register("phone")} /></Field>
        <Field label="Billing address" htmlFor="c-addr" className="sm:col-span-2"><Textarea id="c-addr" {...form.register("billingAddress")} /></Field>
        <Field label="Tax ID (GSTIN)" htmlFor="c-tax"><Input id="c-tax" {...form.register("taxId")} /></Field>
      </form>
    </Dialog>
  );
}

type Profile = Customer & {
  hasPortalAccess: boolean;
  stats: { activeSubscriptions: number; totalPaid: string; outstanding: string; lifetimeBilled: string; lastPayment: string | null };
  health: Health | null;
};
interface ActivityRow { id: string; type: string; summary: string; actorName: string | null; createdAt: string; entity: string | null; entityId: string | null }

const ACTIVITY_DOT: Record<string, string> = {
  "payment.received": "bg-success",
  "invoice.generated": "bg-primary",
  "invoice.sent": "bg-primary",
  "invoice.cancelled": "bg-danger",
  "reminder.sent": "bg-pending",
  "cancellation.requested": "bg-danger",
  "note.added": "bg-accent",
};

export function CustomerDetailPage() {
  const { id } = useParams();
  const canWrite = useCan("customer:write");
  const [tab, setTab] = useState<"timeline" | "subscriptions" | "invoices" | "notes">("timeline");
  const [editing, setEditing] = useState(false);
  const profile = useQuery({ queryKey: ["customers", id], queryFn: () => api.get<{ data: Profile }>(`/customers/${id}`).then((r) => r.data) });
  const timeline = useQuery({ queryKey: ["customers", id, "timeline"], queryFn: () => api.list<ActivityRow>(`/customers/${id}/timeline`, { pageSize: 50 }), enabled: tab === "timeline" });
  const subs = useQuery({ queryKey: ["subscriptions", "customer", id], queryFn: () => api.list<Subscription>("/subscriptions", { customerId: id, pageSize: 50 }), enabled: tab === "subscriptions" });
  const invoices = useQuery({ queryKey: ["invoices", "customer", id], queryFn: () => api.list<Invoice>("/invoices", { customerId: id, pageSize: 50 }), enabled: tab === "invoices" });

  if (profile.isLoading) return <Page><Skeleton className="h-96" /></Page>;
  if (profile.error || !profile.data) return <Page><ErrorState message={profile.error?.message} /></Page>;
  const c = profile.data;

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/customers" className="hover:text-ink">Customers</Link>}
        title={c.companyName || c.contactName}
        description={<>{c.contactName} · {c.email} · {c.hasPortalAccess ? <Badge tone="success">Portal login</Badge> : <Badge>No portal login</Badge>}</>}
        actions={canWrite && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active subscriptions" value={c.stats.activeSubscriptions} />
        <Stat label="Outstanding" value={money(c.stats.outstanding)} tone={Number(c.stats.outstanding) > 0 ? "danger" : undefined} />
        <Stat label="Total paid" value={money(c.stats.totalPaid)} detail={c.stats.lastPayment ? `Last payment ${date(c.stats.lastPayment)}` : "No payments yet"} />
        <Stat label="Lifetime billed" value={money(c.stats.lifetimeBilled)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <Tabs
            value={tab}
            onChange={setTab}
            className="px-4"
            items={[
              { value: "timeline", label: "Timeline" },
              { value: "subscriptions", label: "Subscriptions" },
              { value: "invoices", label: "Invoices" },
              { value: "notes", label: "Notes" },
            ]}
          />
          {tab === "timeline" &&
            (timeline.data?.data.length ? (
              <ol className="relative space-y-5 p-5 before:absolute before:top-6 before:bottom-6 before:left-[25px] before:w-px before:bg-line">
                {timeline.data.data.map((a) => (
                  <li key={a.id} className="relative flex gap-3 text-[13px]">
                    <span className={cn("relative z-10 mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-surface", ACTIVITY_DOT[a.type] ?? "bg-draft")} />
                    <div>
                      <div className="text-ink">{a.summary}</div>
                      <div className="text-[12px] text-muted">{dateTime(a.createdAt)}{a.actorName && ` · ${a.actorName}`}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title={timeline.isLoading ? "Loading…" : "No activity yet"} />
            ))}
          {tab === "subscriptions" && (
            <SimpleList
              rows={subs.data?.data.map((s) => ({ id: s.id, href: `/subscriptions/${s.id}`, title: s.number, detail: `${s.planName} · since ${date(s.startDate)}`, status: s.status }))}
            />
          )}
          {tab === "invoices" && (
            <SimpleList
              rows={invoices.data?.data.map((i) => ({ id: i.id, href: `/invoices/${i.id}`, title: i.number, detail: `${money(i.total)} · due ${date(i.dueDate)}`, status: i.isOverdue ? "overdue" : i.status }))}
            />
          )}
          {tab === "notes" && <Notes customerId={c.id} canWrite={canWrite} />}
        </Card>
        <div className="space-y-6">
          {c.health && (
            <Card className="p-5">
              <h3 className="mb-3 text-[15px] font-semibold">Subscription health</h3>
              <HealthMeter health={c.health} />
            </Card>
          )}
          <Card className="p-5">
            <DescriptionList
              className="sm:grid-cols-1 lg:grid-cols-1"
              items={[
                { label: "Phone", value: c.phone ?? "—" },
                { label: "Billing address", value: <span className="whitespace-pre-line">{c.billingAddress ?? "—"}</span> },
                { label: "Tax ID", value: c.taxId ?? "—" },
                { label: "Customer since", value: date(c.createdAt) },
              ]}
            />
          </Card>
        </div>
      </div>
      {editing && <CustomerDialog customer={c} onClose={() => setEditing(false)} />}
    </Page>
  );
}

function SimpleList({ rows }: { rows?: { id: string; href: string; title: string; detail: string; status: string }[] }) {
  if (!rows) return <Skeleton className="m-4 h-24" />;
  if (!rows.length) return <EmptyState title="Nothing here yet" />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={r.href} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-subtle/70">
            <span><span className="font-medium text-ink">{r.title}</span> <span className="text-muted">· {r.detail}</span></span>
            <StatusBadge status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Notes({ customerId, canWrite }: { customerId: string; canWrite: boolean }) {
  const [body, setBody] = useState("");
  const notes = useQuery({
    queryKey: ["customers", customerId, "notes"],
    queryFn: () => api.get<{ data: { id: string; body: string; authorName: string | null; createdAt: string }[] }>(`/customers/${customerId}/notes`).then((r) => r.data),
  });
  const add = useAction(() => api.post(`/customers/${customerId}/notes`, { body }), { success: "Note added", invalidate: [["customers", customerId]], onSuccess: () => setBody("") });
  return (
    <div className="space-y-4 p-5">
      {canWrite && (
        <div className="space-y-2">
          <Textarea placeholder="Internal note — only staff can see this" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button size="sm" onClick={() => add.mutate(undefined)} disabled={!body.trim()} loading={add.isPending}>Add note</Button>
        </div>
      )}
      {notes.data?.length ? (
        <ul className="space-y-3">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-md bg-accent-soft/60 p-3 text-[13px]">
              <p className="whitespace-pre-line text-ink">{n.body}</p>
              <p className="mt-1 text-[12px] text-muted">{n.authorName} · {dateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No notes yet.</p>
      )}
    </div>
  );
}
