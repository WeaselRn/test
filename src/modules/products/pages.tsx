/** CAT-1, CAT-2: products and variants. Owner: Person 2. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { toMinor, fromMinor } from "@shared/money";
import { PRODUCT_TYPES, productSchema, variantSchema } from "@shared/schemas";
import type { Product, ProductVariant } from "@shared/types";
import {
  Alert,
  Badge,
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
  Switch,
  Textarea,
  Toolbar,
  useListParams,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { useAction } from "@/lib/hooks";
import { useTaxes } from "@/lib/lookups";
import { money, titleCase } from "@/lib/utils";

type ProductRow = Product & { variantCount: number };

export function ProductsPage() {
  const list = useListParams({ sort: "name" });
  const canWrite = useCan("catalog:write");
  const navigate = useNavigate();
  const active = list.params.get("active") ?? "";
  const products = useQuery({ queryKey: ["products", list.query, active], queryFn: () => api.list<ProductRow>("/products", { ...list.query, active }) });

  const columns: Column<ProductRow>[] = [
    { key: "name", header: "Product", sortKey: "name", cell: (p) => <span className="font-medium text-ink">{p.name}</span> },
    { key: "type", header: "Type", cell: (p) => titleCase(p.type) },
    { key: "sales", header: "Sales price", sortKey: "salesPrice", align: "right", cell: (p) => money(p.salesPrice) },
    { key: "cost", header: "Cost price", align: "right", hideOnMobile: true, cell: (p) => money(p.costPrice) },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      hideOnMobile: true,
      cell: (p) => {
        const s = toMinor(p.salesPrice);
        return s ? `${Math.round(((s - toMinor(p.costPrice)) / s) * 100)}%` : "—";
      },
    },
    { key: "variants", header: "Variants", align: "right", cell: (p) => p.variantCount },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.isActive ? "active" : "disabled"} label={p.isActive ? "Active" : "Inactive"} /> },
  ];

  return (
    <Page>
      <PageHeader
        title="Products"
        description="Everything you sell, with base prices, costs and variant surcharges."
        actions={
          canWrite && (
            <Button onClick={() => navigate("/products/new")}>
              <Plus /> New product
            </Button>
          )
        }
      />
      <Card>
        <Toolbar>
          <Segmented
            value={active}
            onChange={(v) => list.set({ active: v })}
            items={[
              { value: "", label: "All" },
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
          <Input placeholder="Search products" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={columns}
          result={products.data}
          isLoading={products.isLoading}
          error={products.error}
          onRetry={() => products.refetch()}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(p) => navigate(`/products/${p.id}`)}
          empty={<EmptyState icon={<Boxes />} title="No products yet" description="Create your first product to start building plans." />}
        />
      </Card>
    </Page>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const product = useQuery({
    queryKey: ["products", id],
    queryFn: () => api.get<{ data: Product & { variants: ProductVariant[] } }>(`/products/${id}`).then((r) => r.data),
    enabled: !isNew,
  });
  if (!isNew && product.isLoading) return <Page><Skeleton className="h-64" /></Page>;
  if (!isNew && product.error) return <Page><ErrorState message={product.error.message} /></Page>;
  return <ProductForm key={id} product={isNew ? null : product.data!} />;
}

function ProductForm({ product }: { product: (Product & { variants: ProductVariant[] }) | null }) {
  const navigate = useNavigate();
  const canWrite = useCan("catalog:write");
  const taxes = useTaxes();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const form = useZodForm(productSchema, {
    defaultValues: product
      ? { name: product.name, type: product.type, salesPrice: product.salesPrice, costPrice: product.costPrice, notes: product.notes ?? "", isActive: product.isActive, taxIds: product.taxIds }
      : { name: "", type: "software", salesPrice: "", costPrice: "0.00", notes: "", isActive: true, taxIds: [] },
    disabled: !canWrite,
  });
  const { errors, isSubmitting } = form.formState;
  const taxIds = form.watch("taxIds") ?? [];
  const remove = useAction(() => api.delete(`/products/${product!.id}`), { success: "Product deleted", invalidate: [["products"]], onSuccess: () => navigate("/products") });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = product
        ? await api.patch<{ data: Product }>(`/products/${product.id}`, values)
        : await api.post<{ data: Product }>("/products", values);
      navigate(`/products/${res.data.id}`, { replace: true });
    } catch (err) {
      setError(applyServerErrors(form, err));
    }
  });

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/products" className="hover:text-ink">Products</Link>}
        title={product ? product.name : "New product"}
        actions={
          canWrite && (
            <>
              {product && (
                <Button variant="secondary" onClick={() => setDeleting(true)}>
                  <Trash2 /> Delete
                </Button>
              )}
              <Button type="submit" form="product-form" loading={isSubmitting}>
                {product ? "Save changes" : "Create product"}
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <form id="product-form" onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && <Alert>{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" htmlFor="p-name" error={errors.name?.message}>
                <Input id="p-name" aria-invalid={!!errors.name} {...form.register("name")} />
              </Field>
              <Field label="Product type" htmlFor="p-type">
                <Select id="p-type" {...form.register("type")}>
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sales price (₹)" htmlFor="p-sales" error={errors.salesPrice?.message}>
                <Input id="p-sales" inputMode="decimal" aria-invalid={!!errors.salesPrice} {...form.register("salesPrice")} />
              </Field>
              <Field label="Cost price (₹)" htmlFor="p-cost" error={errors.costPrice?.message}>
                <Input id="p-cost" inputMode="decimal" aria-invalid={!!errors.costPrice} {...form.register("costPrice")} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="p-notes" error={errors.notes?.message}>
              <Textarea id="p-notes" {...form.register("notes")} />
            </Field>
            <Field label="Taxes" hint="Applied to this product on subscriptions and invoices.">
              <div className="flex flex-wrap gap-2">
                {taxes.data?.map((t) => {
                  const on = taxIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => form.setValue("taxIds", on ? taxIds.filter((x) => x !== t.id) : [...taxIds, t.id], { shouldDirty: true })}
                      className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${on ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Switch label="Active" description="Inactive products cannot be added to new subscriptions." {...form.register("isActive")} />
          </form>
        </Card>
        {product ? <VariantsCard product={product} canWrite={canWrite} /> : (
          <Card className="p-5 text-[13px] text-muted">Save the product first, then add variants such as Brand: Odoo with an extra price.</Card>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate(undefined)}
        loading={remove.isPending}
        tone="danger"
        title={`Delete ${product?.name}?`}
        description="Products used by subscriptions cannot be deleted; deactivate them instead."
        confirmLabel="Delete"
      />
    </Page>
  );
}

function VariantsCard({ product, canWrite }: { product: Product & { variants: ProductVariant[] }; canWrite: boolean }) {
  const [editing, setEditing] = useState<ProductVariant | "new" | null>(null);
  const remove = useAction((id: string) => api.delete(`/variants/${id}`), { success: "Variant removed", invalidate: [["products"]] });
  return (
    <Card className="self-start">
      <CardHeader
        title="Variants"
        description="Final price = base price + variant extra price."
        action={
          canWrite && (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <Plus /> Add
            </Button>
          )
        }
      />
      {product.variants.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">No variants. Add one for each attribute value, for example Brand: Odoo.</p>
      ) : (
        <ul className="divide-y divide-line">
          {product.variants.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
              <div>
                <div className="font-medium text-ink">
                  {v.attribute}: {v.value}
                </div>
                <div className="text-muted">
                  {money(product.salesPrice)} + {money(v.extraPrice)} = <span className="tabular font-medium text-ink">{money(fromMinor(toMinor(product.salesPrice) + toMinor(v.extraPrice)))}</span>
                </div>
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(v)} aria-label="Edit variant">
                    <Pencil />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(v.id)} aria-label="Remove variant">
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <VariantDialog productId={product.id} variant={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function VariantDialog({ productId, variant, onClose }: { productId: string; variant: ProductVariant | null; onClose: () => void }) {
  const form = useZodForm(variantSchema, {
    defaultValues: variant ? { attribute: variant.attribute, value: variant.value, extraPrice: variant.extraPrice } : { attribute: "Brand", value: "", extraPrice: "0.00" },
  });
  const save = useAction(
    (v: { attribute: string; value: string; extraPrice: string }) => (variant ? api.patch(`/variants/${variant.id}`, v) : api.post(`/products/${productId}/variants`, v)),
    { success: "Variant saved", invalidate: [["products"]], onSuccess: onClose },
  );
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onClose={onClose}
      title={variant ? "Edit variant" : "Add variant"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="variant-form" loading={save.isPending}>Save</Button>
        </>
      }
    >
      <form
        id="variant-form"
        className="grid gap-4 sm:grid-cols-3"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v, { onError: (e) => applyServerErrors(form, e) }))}
      >
        <Field label="Attribute" htmlFor="v-attr" error={errors.attribute?.message}>
          <Input id="v-attr" {...form.register("attribute")} />
        </Field>
        <Field label="Value" htmlFor="v-val" error={errors.value?.message}>
          <Input id="v-val" placeholder="Odoo" {...form.register("value")} />
        </Field>
        <Field label="Extra price (₹)" htmlFor="v-extra" error={errors.extraPrice?.message}>
          <Input id="v-extra" inputMode="decimal" {...form.register("extraPrice")} />
        </Field>
      </form>
    </Dialog>
  );
}

type VariantRow = ProductVariant & { productName: string; basePrice: string; finalPrice: string };

export function VariantsPage() {
  const list = useListParams();
  const navigate = useNavigate();
  const variants = useQuery({ queryKey: ["variants", list.query], queryFn: () => api.list<VariantRow>("/products/variants", list.query) });
  return (
    <Page>
      <PageHeader title="Variants" description="All product variants and their final prices. Edit variants from the product page." />
      <Card>
        <Toolbar>
          <span className="text-[13px] text-muted">Final price = base price + extra price</span>
          <Input placeholder="Search product, attribute or value" defaultValue={list.q} onChange={(e) => list.set({ q: e.target.value })} className="sm:max-w-xs" />
        </Toolbar>
        <DataTable
          columns={[
            { key: "product", header: "Product", cell: (v) => <span className="font-medium text-ink">{v.productName}</span> },
            { key: "attr", header: "Attribute", cell: (v) => <Badge tone="primary">{v.attribute}</Badge> },
            { key: "value", header: "Value", cell: (v) => v.value },
            { key: "base", header: "Base price", align: "right", hideOnMobile: true, cell: (v) => money(v.basePrice) },
            { key: "extra", header: "Extra", align: "right", cell: (v) => `+ ${money(v.extraPrice)}` },
            { key: "final", header: "Final price", align: "right", cell: (v) => <span className="font-medium text-ink">{money(v.finalPrice)}</span> },
          ]}
          result={variants.data}
          isLoading={variants.isLoading}
          error={variants.error}
          onPage={(page) => list.set({ page }, false)}
          onRowClick={(v) => navigate(`/products/${v.productId}`)}
          empty={<EmptyState title="No variants yet" description="Add variants from a product's page." />}
        />
      </Card>
    </Page>
  );
}
