/** QT-1: quotation templates and quotations. Owner: Person 2. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FileClock, LayoutTemplate, Plus } from "lucide-react";
import { addDays, todayISO } from "@shared/dates";
import type { Customer, Subscription } from "@shared/types";
import { AsyncSelect } from "@/components/shared/async-select";
import { cleanLines, LineItemsEditor, type LineDraft } from "@/components/shared/line-items-editor";
import {
  Alert,
  Button,
  Card,
  CardHeader,
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
  Toolbar,
  useListParams,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { usePlans, useTemplates } from "@/lib/lookups";
import { date, money } from "@/lib/utils";

interface TemplateRow {
  id: string;
  name: string;
  planId: string;
  planName: string;
  validityDays: number;
  paymentTermDays: number;
  lineCount: number;
}
interface TemplateDetail extends Omit<TemplateRow, "lineCount"> {
  lines: { id: string; productId: string; productName: string; variantId: string | null; quantity: number }[];
}

export function TemplatesPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const canWrite = useCan("template:write");
  const templates = useQuery({ queryKey: ["templates", list.query], queryFn: () => api.list<TemplateRow>("/quotation-templates", list.query) });
  return (
    <Page>
      <PageHeader
        title="Quotation templates"
        description="Reusable bundles of a plan and product lines. Staff start quotations from them."
        actions={canWrite && <Button onClick={() => navigate("/quotation-templates/new")}><Plus /> New template</Button>}
      />
      <Card>
        <DataTable
          columns={[
            { key: "name", header: "Template", cell: (t) => <span className="font-medium text-ink">{t.name}</span> },
            { key: "plan", header: "Plan", cell: (t) => t.planName },
            { key: "lines", header: "Lines", align: "right", cell: (t) => t.lineCount },
            { key: "valid", header: "Validity", align: "right", cell: (t) => `${t.validityDays} days` },
            { key: "terms", header: "Payment terms", align: "right", hideOnMobile: true, cell: (t) => `${t.paymentTermDays} days` },
          ]}
          result={templates.data}
          isLoading={templates.isLoading}
          error={templates.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(t) => navigate(`/quotation-templates/${t.id}`)}
          empty={<EmptyState icon={<LayoutTemplate />} title="No templates yet" />}
        />
      </Card>
    </Page>
  );
}

export function TemplateFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const tpl = useQuery({
    queryKey: ["templates", id],
    queryFn: () => api.get<{ data: TemplateDetail }>(`/quotation-templates/${id}`).then((r) => r.data),
    enabled: !isNew,
  });
  if (!isNew && tpl.isLoading) return <Page><Skeleton className="h-64" /></Page>;
  if (!isNew && tpl.error) return <Page><ErrorState message={tpl.error.message} /></Page>;
  return <TemplateForm key={id} template={isNew ? null : tpl.data!} />;
}

function TemplateForm({ template }: { template: TemplateDetail | null }) {
  const navigate = useNavigate();
  const plans = usePlans({ activeOnly: true });
  const canWrite = useCan("template:write");
  const [name, setName] = useState(template?.name ?? "");
  const [planId, setPlanId] = useState(template?.planId ?? "");
  const [validityDays, setValidity] = useState(template?.validityDays ?? 30);
  const [paymentTermDays, setTerms] = useState(template?.paymentTermDays ?? 15);
  const [lines, setLines] = useState<LineDraft[]>(template?.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const plan = plans.data?.find((p) => p.id === (planId || plans.data?.[0]?.id));

  const save = useAction(
    () => {
      const body = { name, planId: planId || plans.data?.[0]?.id, validityDays, paymentTermDays, lines: cleanLines(lines).map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) };
      return template ? api.patch<{ data: TemplateDetail }>(`/quotation-templates/${template.id}`, body) : api.post<{ data: TemplateDetail }>("/quotation-templates", body);
    },
    { success: "Template saved", invalidate: [["templates"], ["lookup"]], onSuccess: (r) => navigate(`/quotation-templates/${r.data.id}`, { replace: true }) },
  );
  const remove = useAction(() => api.delete(`/quotation-templates/${template!.id}`), { success: "Template deleted", invalidate: [["templates"], ["lookup"]], onSuccess: () => navigate("/quotation-templates") });

  const submit = () => {
    setErrors({});
    setError(null);
    save.mutate(undefined, {
      onError: (e) => {
        if (e instanceof ApiRequestError) {
          setErrors(e.fields);
          setError(e.message);
        }
      },
    });
  };

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/quotation-templates" className="hover:text-ink">Quotation templates</Link>}
        title={template ? template.name : "New template"}
        actions={
          <>
            {template && <Button variant="secondary" onClick={() => setStarting(true)}><FileClock /> Start quotation</Button>}
            {template && canWrite && <Button variant="ghost" onClick={() => remove.mutate(undefined)}>Delete</Button>}
            {canWrite && <Button onClick={submit} loading={save.isPending}>Save template</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="space-y-4 self-start p-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Template name" htmlFor="tpl-name" error={errors.name}>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Plan" htmlFor="tpl-plan" error={errors.planId}>
            <Select id="tpl-plan" value={planId || plan?.id || ""} onChange={(e) => setPlanId(e.target.value)}>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {money(p.price)} {p.billingPeriod}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Validity (days)" htmlFor="tpl-valid" error={errors.validityDays}>
              <Input id="tpl-valid" type="number" min={1} value={validityDays} onChange={(e) => setValidity(Number(e.target.value))} />
            </Field>
            <Field label="Payment terms (days)" htmlFor="tpl-terms" error={errors.paymentTermDays}>
              <Input id="tpl-terms" type="number" min={0} value={paymentTermDays} onChange={(e) => setTerms(Number(e.target.value))} />
            </Field>
          </div>
          <p className="text-[12px] text-muted">A quotation from this template expires {validityDays} days after it is created ({date(addDays(todayISO(), validityDays))} if started today).</p>
        </Card>
        <Card>
          <CardHeader title="Product lines" description={plan ? `Minimum quantity for ${plan.name}: ${plan.minQuantity}` : undefined} />
          <div className="p-5">
            <LineItemsEditor value={lines} onChange={setLines} errors={errors} minQuantity={plan?.minQuantity ?? 1} />
          </div>
        </Card>
      </div>
      {starting && template && <StartQuotationDialog templateId={template.id} onClose={() => setStarting(false)} />}
    </Page>
  );
}

/** Pick a template, customer and start date; creates a subscription in status "quotation". */
export function StartQuotationDialog({ templateId, onClose }: { templateId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const templates = useTemplates();
  const [tpl, setTpl] = useState(templateId ?? "");
  const [customerId, setCustomer] = useState("");
  const [startDate, setStart] = useState(todayISO());
  const [expiryDate, setExpiry] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAction(
    () =>
      api.post<{ data: Subscription }>(`/subscriptions/from-template/${tpl || templates.data?.[0]?.id}`, {
        customerId,
        startDate,
        expiryDate: expiryDate || null,
      }),
    { success: (r) => `Quotation ${r.data.number} created`, invalidate: [["subscriptions"]], onSuccess: (r) => navigate(`/subscriptions/${r.data.id}`) },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Start a quotation"
      description="The quotation copies the template's plan and lines. You can edit it before sending."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate(undefined, { onError: (e) => e instanceof ApiRequestError && setErrors(e.fields) })}
            loading={create.isPending}
            disabled={!customerId}
          >
            Create quotation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Template" htmlFor="sq-tpl">
          <Select id="sq-tpl" value={tpl || templates.data?.[0]?.id || ""} onChange={(e) => setTpl(e.target.value)}>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.planName}</option>
            ))}
          </Select>
        </Field>
        <Field label="Customer" error={errors.customerId}>
          <AsyncSelect<Customer>
            path="/customers"
            value={customerId}
            onChange={(id) => setCustomer(id)}
            getLabel={(c) => c.companyName || c.contactName}
            getDetail={(c) => c.email}
            placeholder="Choose a customer"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" htmlFor="sq-start" error={errors.startDate}>
            <Input id="sq-start" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Expiry date" htmlFor="sq-exp" hint="Optional" error={errors.expiryDate}>
            <Input id="sq-exp" type="date" value={expiryDate} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

type QuoteRow = Subscription & { recurringTotal: string; billingPeriod: string };

export function QuotationsPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const status = list.params.get("status") ?? "draft,quotation";
  const quotes = useQuery({ queryKey: ["subscriptions", "quotes", list.query, status], queryFn: () => api.list<QuoteRow>("/subscriptions", { ...list.query, status }) });
  const today = todayISO();
  return (
    <Page>
      <PageHeader
        title="Quotations"
        description="Drafts and offers sent to customers. A confirmed quotation becomes a subscription."
        actions={<Button onClick={() => setStarting(true)}><Plus /> New quotation</Button>}
      />
      <Card>
        <Toolbar>
          <Segmented
            value={status}
            onChange={(v) => list.set({ status: v })}
            items={[
              { value: "draft,quotation", label: "Open" },
              { value: "draft", label: "Draft" },
              { value: "quotation", label: "Sent" },
              { value: "confirmed", label: "Confirmed" },
            ]}
          />
          <Input placeholder="Search number or customer" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            { key: "number", header: "Number", cell: (s) => <span className="font-medium text-ink">{s.number}</span> },
            { key: "customer", header: "Customer", cell: (s) => s.customerName },
            { key: "plan", header: "Plan", hideOnMobile: true, cell: (s) => s.planName },
            { key: "value", header: "Recurring", align: "right", cell: (s) => money(s.recurringTotal) },
            {
              key: "valid",
              header: "Valid until",
              cell: (s) =>
                s.quoteValidUntil ? (
                  <span className={s.quoteValidUntil < today ? "text-danger" : ""}>{date(s.quoteValidUntil)}{s.quoteValidUntil < today && " · expired"}</span>
                ) : (
                  "—"
                ),
            },
            { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status === "quotation" && s.quoteValidUntil && s.quoteValidUntil < today ? "expired" : s.status} /> },
          ]}
          result={quotes.data}
          isLoading={quotes.isLoading}
          error={quotes.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(s) => navigate(`/subscriptions/${s.id}`)}
          empty={<EmptyState icon={<FileClock />} title="No open quotations" action={<Button size="sm" onClick={() => setStarting(true)}>New quotation</Button>} />}
        />
      </Card>
      {starting && <StartQuotationDialog onClose={() => setStarting(false)} />}
    </Page>
  );
}
