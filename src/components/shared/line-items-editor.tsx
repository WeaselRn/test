/**
 * Editable product lines for quotation templates and subscriptions. Owner: Person 1.
 * Controlled component: parent owns the array; errors use the API's `lines.<i>.<field>` keys.
 */
import { Plus, Trash2 } from "lucide-react";
import { toMinor, fromMinor } from "@shared/money";
import { Button, Input, Select } from "@/components/ui";
import { useProductDetail, useProducts, useTaxes } from "@/lib/lookups";
import { money } from "@/lib/utils";

export interface LineDraft {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice?: string;
  taxId?: string | null;
}

export function LineItemsEditor({
  value,
  onChange,
  errors = {},
  withPricing,
  minQuantity = 1,
}: {
  value: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  errors?: Record<string, string>;
  /** Show unit price override and tax columns (subscriptions). */
  withPricing?: boolean;
  minQuantity?: number;
}) {
  const products = useProducts({ activeOnly: true });
  const update = (i: number, patch: Partial<LineDraft>) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">No product lines yet.</p>}
      {value.map((line, i) => (
        <LineRow
          key={i}
          line={line}
          index={i}
          products={products.data ?? []}
          withPricing={withPricing}
          minQuantity={minQuantity}
          errors={errors}
          onChange={(patch) => update(i, patch)}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...value, { productId: products.data?.[0]?.id ?? "", quantity: minQuantity, variantId: null }])}
        disabled={!products.data?.length}
      >
        <Plus /> Add line
      </Button>
    </div>
  );
}

function LineRow({
  line,
  index,
  products,
  withPricing,
  minQuantity,
  errors,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  index: number;
  products: { id: string; name: string; salesPrice: string; taxIds: string[] }[];
  withPricing?: boolean;
  minQuantity: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  const detail = useProductDetail(line.productId || null);
  const taxes = useTaxes();
  const variant = detail.data?.variants.find((v) => v.id === line.variantId);
  const defaultUnit = detail.data ? fromMinor(toMinor(detail.data.salesPrice) + (variant ? toMinor(variant.extraPrice) : 0)) : null;
  const err = (f: string) => errors[`lines.${index}.${f}`];

  return (
    <div className="rounded-md border border-line bg-subtle/50 p-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1.4fr_90px_auto] sm:items-start">
        <div>
          <Select
            aria-label="Product"
            value={line.productId}
            aria-invalid={!!err("productId")}
            onChange={(e) => onChange({ productId: e.target.value, variantId: null, unitPrice: undefined, taxId: undefined })}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {err("productId") && <p className="mt-1 text-[12px] text-danger">{err("productId")}</p>}
        </div>
        <Select aria-label="Variant" value={line.variantId ?? ""} onChange={(e) => onChange({ variantId: e.target.value || null, unitPrice: undefined })}>
          <option value="">No variant</option>
          {detail.data?.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.attribute}: {v.value} (+{money(v.extraPrice)})
            </option>
          ))}
        </Select>
        <div>
          <Input
            aria-label="Quantity"
            type="number"
            min={minQuantity}
            value={line.quantity}
            aria-invalid={!!err("quantity")}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          />
          {err("quantity") && <p className="mt-1 text-[12px] text-danger">{err("quantity")}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove line" className="justify-self-end">
          <Trash2 />
        </Button>
      </div>
      {withPricing && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-[12px] text-muted">
            Unit price {defaultUnit && <span className="text-faint">(default {money(defaultUnit)})</span>}
            <Input
              className="mt-1"
              inputMode="decimal"
              placeholder={defaultUnit ?? "0.00"}
              value={line.unitPrice ?? ""}
              aria-invalid={!!err("unitPrice")}
              onChange={(e) => onChange({ unitPrice: e.target.value || undefined })}
            />
          </label>
          <label className="text-[12px] text-muted">
            Tax
            <Select className="mt-1" value={line.taxId ?? ""} onChange={(e) => onChange({ taxId: e.target.value || null })}>
              <option value="">Product default</option>
              {taxes.data
                ?.filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </label>
        </div>
      )}
    </div>
  );
}

/** Strip UI-only empties before sending lines to the API. */
export function cleanLines(lines: LineDraft[]) {
  return lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId || null,
    quantity: l.quantity,
    ...(l.unitPrice ? { unitPrice: l.unitPrice } : {}),
    ...(l.taxId !== undefined && l.taxId !== "" ? { taxId: l.taxId } : {}),
  }));
}
