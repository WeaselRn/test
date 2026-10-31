/** TAX-1: tax rules. Owner: Person 2. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Receipt } from "lucide-react";
import { taxSchema } from "@shared/schemas";
import type { Tax } from "@shared/types";
import { Alert, Button, Card, DataTable, Dialog, EmptyState, Field, Input, Page, PageHeader, Select, StatusBadge, Switch, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { money } from "@/lib/utils";

export function TaxesPage() {
  const list = useListParams();
  const canWrite = useCan("tax:write");
  const [editing, setEditing] = useState<Tax | "new" | null>(null);
  const taxes = useQuery({ queryKey: ["taxes", list.query], queryFn: () => api.list<Tax>("/taxes", list.query) });
  return (
    <Page>
      <PageHeader
        title="Taxes"
        description="Tax is added on each line after discounts. Percentage taxes apply to the line amount; fixed taxes apply per unit."
        actions={canWrite && <Button onClick={() => setEditing("new")}><Plus /> New tax</Button>}
      />
      <Card>
        <DataTable
          columns={[
            { key: "name", header: "Name", cell: (t) => <span className="font-medium text-ink">{t.name}</span> },
            { key: "kind", header: "Type", cell: (t) => (t.kind === "percentage" ? "Percentage" : "Fixed per unit") },
            { key: "rate", header: "Rate", align: "right", cell: (t) => (t.kind === "percentage" ? `${Number(t.rate)}%` : money(t.rate)) },
            { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.isActive ? "active" : "disabled"} label={t.isActive ? "Active" : "Inactive"} /> },
          ]}
          result={taxes.data}
          isLoading={taxes.isLoading}
          error={taxes.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={canWrite ? (t) => setEditing(t) : undefined}
          empty={<EmptyState icon={<Receipt />} title="No tax rules" description="Add GST or other taxes to apply them to products." />}
        />
      </Card>
      {editing && <TaxDialog tax={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function TaxDialog({ tax, onClose }: { tax: Tax | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(taxSchema, {
    defaultValues: tax ? { name: tax.name, kind: tax.kind, rate: tax.rate, isActive: tax.isActive } : { name: "", kind: "percentage", rate: "18", isActive: true },
  });
  const kind = form.watch("kind");
  const save = useAction((v: unknown) => (tax ? api.patch(`/taxes/${tax.id}`, v) : api.post("/taxes", v)), {
    success: "Tax saved",
    invalidate: [["taxes"], ["lookup"]],
    onSuccess: onClose,
  });
  const remove = useAction(() => api.delete(`/taxes/${tax!.id}`), { success: "Tax deleted", invalidate: [["taxes"], ["lookup"]], onSuccess: onClose });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onClose={onClose}
      title={tax ? `Edit ${tax.name}` : "New tax"}
      footer={
        <>
          {tax && <Button variant="ghost" className="mr-auto text-danger" onClick={() => remove.mutate(undefined)} loading={remove.isPending}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="tax-form" loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form id="tax-form" noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutateAsync(v).catch((e) => setError(applyServerErrors(form, e))))}>
        {error && <Alert>{error}</Alert>}
        <Field label="Name" htmlFor="t-name" error={errors.name?.message}>
          <Input id="t-name" placeholder="GST 18%" {...form.register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="t-kind">
            <Select id="t-kind" {...form.register("kind")}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount per unit</option>
            </Select>
          </Field>
          <Field label={kind === "percentage" ? "Rate (%)" : "Amount per unit (₹)"} htmlFor="t-rate" error={errors.rate?.message}>
            <Input id="t-rate" inputMode="decimal" {...form.register("rate")} />
          </Field>
        </div>
        <Switch label="Active" {...form.register("isActive")} />
      </form>
    </Dialog>
  );
}
