/** PLAN-1, PLAN-2: plans and lifecycle switches. Owner: Person 2. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { todayISO } from "@shared/dates";
import { BILLING_PERIODS, planSchema } from "@shared/schemas";
import type { Plan } from "@shared/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Input,
  Page,
  PageHeader,
  Segmented,
  Select,
  StatusBadge,
  Switch,
  Toolbar,
  useListParams,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { date, money, titleCase } from "@/lib/utils";

type PlanRow = Plan & { activeSubscriptions: number };

export function PlansPage() {
  const list = useListParams({ sort: "name" });
  const canWrite = useCan("catalog:write");
  const status = list.params.get("status") ?? "";
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const plans = useQuery({ queryKey: ["plans", list.query, status], queryFn: () => api.list<PlanRow>("/plans", { ...list.query, status }) });

  const columns: Column<PlanRow>[] = [
    { key: "name", header: "Plan", sortKey: "name", cell: (p) => <span className="font-medium text-ink">{p.name}</span> },
    { key: "price", header: "Price", sortKey: "price", align: "right", cell: (p) => `${money(p.price)} / ${p.billingPeriod.replace("ly", "").replace("dai", "day")}` },
    { key: "min", header: "Min qty", align: "right", hideOnMobile: true, cell: (p) => p.minQuantity },
    { key: "avail", header: "Available", hideOnMobile: true, cell: (p) => `${date(p.availableFrom)} – ${p.availableTo ? date(p.availableTo) : "open"}` },
    {
      key: "switches",
      header: "Options",
      hideOnMobile: true,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.pausable && <Badge tone="primary">Pausable</Badge>}
          {p.closable && <Badge>Closable</Badge>}
          {p.renewable && <Badge tone="success">Renewable</Badge>}
          {p.autoClose && <Badge tone="accent">Auto-close</Badge>}
        </div>
      ),
    },
    { key: "subs", header: "Active subs", align: "right", cell: (p) => p.activeSubscriptions },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <Page>
      <PageHeader
        title="Plans"
        description="Recurring prices, billing frequency and which lifecycle actions customers may take."
        actions={
          canWrite && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New plan
            </Button>
          )
        }
      />
      <Card>
        <Toolbar>
          <Segmented
            value={status}
            onChange={(v) => list.set({ status: v })}
            items={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <Input placeholder="Search plans" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={columns}
          result={plans.data}
          isLoading={plans.isLoading}
          error={plans.error}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={canWrite ? (p) => setEditing(p) : undefined}
          empty={<EmptyState icon={<Layers />} title="No plans yet" description="Plans set the recurring price and billing frequency." />}
        />
      </Card>
      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(planSchema, {
    defaultValues: plan
      ? { ...plan, availableTo: plan.availableTo ?? null }
      : { name: "", price: "", billingPeriod: "monthly", minQuantity: 1, availableFrom: todayISO(), availableTo: null, autoClose: false, closable: true, pausable: false, renewable: true },
  });
  const { errors, isSubmitting } = form.formState;
  const toggleStatus = useAction(() => api.post(`/plans/${plan!.id}/${plan!.status === "active" ? "close" : "reopen"}`), {
    success: plan?.status === "active" ? "Plan closed for new sales" : "Plan reopened",
    invalidate: [["plans"], ["lookup"]],
    onSuccess: onClose,
  });
  const save = useAction((v: unknown) => (plan ? api.patch(`/plans/${plan.id}`, v) : api.post("/plans", v)), {
    success: "Plan saved",
    invalidate: [["plans"], ["lookup"]],
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={plan ? `Edit ${plan.name}` : "New plan"}
      className="max-w-2xl"
      footer={
        <>
          {plan && (
            <Button variant="ghost" className="mr-auto" onClick={() => toggleStatus.mutate(undefined)} loading={toggleStatus.isPending}>
              {plan.status === "active" ? "Close plan" : "Reopen plan"}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form" loading={isSubmitting || save.isPending}>Save plan</Button>
        </>
      }
    >
      <form
        id="plan-form"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          save.mutateAsync({ ...v, availableTo: v.availableTo || null }).catch((e) => setError(applyServerErrors(form, e))),
        )}
      >
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name" htmlFor="pl-name" error={errors.name?.message}>
            <Input id="pl-name" aria-invalid={!!errors.name} {...form.register("name")} />
          </Field>
          <Field label="Price (₹)" htmlFor="pl-price" error={errors.price?.message}>
            <Input id="pl-price" inputMode="decimal" aria-invalid={!!errors.price} {...form.register("price")} />
          </Field>
          <Field label="Billing frequency" htmlFor="pl-period">
            <Select id="pl-period" {...form.register("billingPeriod")}>
              {BILLING_PERIODS.map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum quantity" htmlFor="pl-min" error={errors.minQuantity?.message}>
            <Input id="pl-min" type="number" min={1} {...form.register("minQuantity")} />
          </Field>
          <Field label="Available from" htmlFor="pl-from" error={errors.availableFrom?.message}>
            <Input id="pl-from" type="date" {...form.register("availableFrom")} />
          </Field>
          <Field label="Available to" htmlFor="pl-to" hint="Leave empty for no end date." error={errors.availableTo?.message}>
            <Input id="pl-to" type="date" {...form.register("availableTo", { setValueAs: (v) => v || null })} />
          </Field>
        </div>
        <div className="grid gap-4 rounded-lg border border-line bg-subtle/60 p-4 sm:grid-cols-2">
          <Switch label="Pausable" description="Subscriptions can pause and resume." {...form.register("pausable")} />
          <Switch label="Closable early" description="Can be closed before expiry." {...form.register("closable")} />
          <Switch label="Renewable" description="Renewal quotations can be created." {...form.register("renewable")} />
          <Switch label="Auto-close at end" description="Close subscriptions when the plan ends." {...form.register("autoClose")} />
        </div>
      </form>
    </Dialog>
  );
}
