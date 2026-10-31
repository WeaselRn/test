/** DISC-1, DISC-2: discount rules. Owner: Person 2. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react";
import { todayISO } from "@shared/dates";
import { discountSchema } from "@shared/schemas";
import type { Discount } from "@shared/types";
import { Alert, Button, Card, DataTable, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, StatusBadge, Switch, Toolbar, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { useProducts } from "@/lib/lookups";
import { date, money } from "@/lib/utils";

type DiscountRow = Discount & { state: string };

const STATE_TONE: Record<string, string> = { live: "active", scheduled: "pending", expired: "closed", exhausted: "cancelled", inactive: "disabled" };

export function DiscountsPage() {
  const list = useListParams();
  const canWrite = useCan("discount:write");
  const [editing, setEditing] = useState<Discount | "new" | null>(null);
  const discounts = useQuery({ queryKey: ["discounts", list.query], queryFn: () => api.list<DiscountRow>("/discounts", list.query) });
  return (
    <Page>
      <PageHeader
        title="Discount rules"
        description="Eligible discounts apply to the next invoice automatically. When several apply, the largest reduction wins."
        actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> New discount</Button>}
      />
      <Card>
        <Toolbar>
          <span className="text-[13px] text-muted">Only admins can create or change discount rules.</span>
          <Input placeholder="Search discounts" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            { key: "name", header: "Name", cell: (d) => <span className="font-medium text-ink">{d.name}</span> },
            { key: "value", header: "Value", align: "right", cell: (d) => (d.kind === "percentage" ? `${Number(d.value)}%` : money(d.value)) },
            { key: "scope", header: "Applies to", cell: (d) => (d.scope === "subscription" ? "Whole subscription" : `${d.productIds.length} product(s)`) },
            {
              key: "conds",
              header: "Conditions",
              hideOnMobile: true,
              cell: (d) =>
                [Number(d.minPurchase) > 0 && `min ${money(d.minPurchase)}`, d.minQuantity > 0 && `min qty ${d.minQuantity}`].filter(Boolean).join(", ") || "None",
            },
            { key: "dates", header: "Valid", hideOnMobile: true, cell: (d) => `${date(d.startsOn)} – ${d.endsOn ? date(d.endsOn) : "no end"}` },
            { key: "usage", header: "Usage", align: "right", cell: (d) => `${d.usageCount}${d.usageLimit ? ` / ${d.usageLimit}` : ""}` },
            { key: "state", header: "State", cell: (d) => <StatusBadge status={STATE_TONE[d.state] ?? "draft"} label={d.state[0]!.toUpperCase() + d.state.slice(1)} /> },
          ]}
          result={discounts.data}
          isLoading={discounts.isLoading}
          error={discounts.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={canWrite ? (d) => setEditing(d) : undefined}
          empty={<EmptyState icon={<Tag />} title="No discount rules" />}
        />
      </Card>
      {editing && <DiscountDialog discount={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function DiscountDialog({ discount, onClose }: { discount: Discount | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const products = useProducts();
  const form = useZodForm(discountSchema, {
    defaultValues: discount
      ? { ...discount, endsOn: discount.endsOn ?? null, usageLimit: discount.usageLimit ?? null }
      : { name: "", kind: "percentage", value: "10", minPurchase: "0.00", minQuantity: 0, startsOn: todayISO(), endsOn: null, usageLimit: null, scope: "subscription", productIds: [], isActive: true },
  });
  const [kind, scope, productIds] = form.watch(["kind", "scope", "productIds"]);
  const save = useAction((v: unknown) => (discount ? api.patch(`/discounts/${discount.id}`, v) : api.post("/discounts", v)), {
    success: "Discount saved",
    invalidate: [["discounts"]],
    onSuccess: onClose,
  });
  const remove = useAction(() => api.delete(`/discounts/${discount!.id}`), { success: "Discount deleted", invalidate: [["discounts"]], onSuccess: onClose });
  const { errors } = form.formState;

  return (
    <Dialog
      open
      onClose={onClose}
      title={discount ? `Edit ${discount.name}` : "New discount"}
      description={discount ? `Used ${discount.usageCount} time(s).` : undefined}
      className="max-w-2xl"
      footer={
        <>
          {discount && <Button variant="ghost" className="mr-auto text-danger" onClick={() => remove.mutate(undefined)} loading={remove.isPending}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="discount-form" loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form
        id="discount-form"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((v) => save.mutateAsync({ ...v, endsOn: v.endsOn || null, usageLimit: v.usageLimit || null }).catch((e) => setError(applyServerErrors(form, e))))}
      >
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="d-name" error={errors.name?.message} className="sm:col-span-3">
            <Input id="d-name" {...form.register("name")} />
          </Field>
          <Field label="Type" htmlFor="d-kind">
            <Select id="d-kind" {...form.register("kind")}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </Select>
          </Field>
          <Field label={kind === "percentage" ? "Percentage (%)" : "Amount (₹)"} htmlFor="d-value" error={errors.value?.message}>
            <Input id="d-value" inputMode="decimal" {...form.register("value")} />
          </Field>
          <Field label="Applies to" htmlFor="d-scope">
            <Select id="d-scope" {...form.register("scope")}>
              <option value="subscription">Whole subscription</option>
              <option value="product">Specific products</option>
            </Select>
          </Field>
          <Field label="Minimum purchase (₹)" htmlFor="d-minp" error={errors.minPurchase?.message}>
            <Input id="d-minp" inputMode="decimal" {...form.register("minPurchase")} />
          </Field>
          <Field label="Minimum quantity" htmlFor="d-minq" error={errors.minQuantity?.message}>
            <Input id="d-minq" type="number" min={0} {...form.register("minQuantity")} />
          </Field>
          <Field label="Usage limit" htmlFor="d-limit" hint="Empty for unlimited" error={errors.usageLimit?.message}>
            <Input id="d-limit" type="number" min={1} {...form.register("usageLimit", { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })} />
          </Field>
          <Field label="Starts on" htmlFor="d-start" error={errors.startsOn?.message}>
            <Input id="d-start" type="date" {...form.register("startsOn")} />
          </Field>
          <Field label="Ends on" htmlFor="d-end" error={errors.endsOn?.message}>
            <Input id="d-end" type="date" {...form.register("endsOn", { setValueAs: (v) => v || null })} />
          </Field>
        </div>
        {scope === "product" && (
          <Field label="Products" error={errors.productIds?.message}>
            <div className="flex flex-wrap gap-2">
              {products.data?.map((p) => {
                const on = (productIds ?? []).includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => form.setValue("productIds", on ? productIds!.filter((x) => x !== p.id) : [...(productIds ?? []), p.id], { shouldValidate: true })}
                    className={`h-8 rounded-full border px-3 text-[12px] font-medium ${on ? "border-primary bg-primary-soft text-primary-ink" : "border-line text-muted hover:text-ink"}`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Switch label="Active" {...form.register("isActive")} />
      </form>
    </Dialog>
  );
}
