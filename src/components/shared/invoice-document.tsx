/**
 * Printable invoice layout used by staff invoice pages and the customer portal.
 * Owner: Person 1 (shared). Print with window.print(); app chrome is hidden by `no-print`.
 */
import type { Invoice, InvoiceLine } from "@shared/types";
import { Logo } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui";
import { date, money } from "@/lib/utils";

export type InvoiceDetail = Invoice & {
  lines: InvoiceLine[];
  customer: Record<string, string | null>;
  discount: { name: string; amount: string } | null;
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const c = invoice.customer;
  return (
    <div className="rounded-lg border border-line bg-surface p-6 shadow-card print:border-0 print:p-0 print:shadow-none sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row">
        <div>
          <Logo />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">Brightloop Software<br />Bengaluru, India</p>
        </div>
        <div className="sm:text-right">
          <div className="text-[12px] tracking-wide text-muted uppercase">Invoice</div>
          <div className="text-xl font-semibold text-ink">{invoice.number}</div>
          <div className="mt-1"><StatusBadge status={invoice.isOverdue ? "overdue" : invoice.status} /></div>
        </div>
      </div>
      <div className="mt-8 grid gap-6 text-[13px] sm:grid-cols-3">
        <div>
          <div className="text-[12px] text-muted">Billed to</div>
          <div className="mt-1 font-medium text-ink">{c.name ?? invoice.customerName}</div>
          {c.contactName && c.contactName !== c.name && <div>{c.contactName}</div>}
          {c.email && <div className="text-muted">{c.email}</div>}
          {c.billingAddress && <div className="whitespace-pre-line text-muted">{c.billingAddress}</div>}
          {c.taxId && <div className="text-muted">Tax ID {c.taxId}</div>}
        </div>
        <div>
          <div className="text-[12px] text-muted">Billing period</div>
          <div className="mt-1 text-ink">{date(invoice.periodStart)} – {date(invoice.periodEnd)}</div>
          {invoice.subscriptionNumber && <div className="text-muted">Subscription {invoice.subscriptionNumber}</div>}
        </div>
        <div>
          <div className="text-[12px] text-muted">Issued · Due</div>
          <div className="mt-1 text-ink">{date(invoice.issueDate)} · {date(invoice.dueDate)}</div>
          {invoice.isOverdue && <div className="text-danger">{invoice.daysOverdue} days overdue</div>}
        </div>
      </div>
      <table className="mt-8 w-full text-[13px]">
        <thead>
          <tr className="border-b border-line-strong text-left text-[12px] text-muted">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Discount</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Tax</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {invoice.lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-2.5 pr-2 text-ink">{l.description}</td>
              <td className="py-2.5 text-right">{l.quantity}</td>
              <td className="py-2.5 text-right">{money(l.unitPrice)}</td>
              <td className="hidden py-2.5 text-right sm:table-cell">{Number(l.discountAmount) ? `− ${money(l.discountAmount)}` : "—"}</td>
              <td className="hidden py-2.5 text-right sm:table-cell">{Number(l.taxAmount) ? money(l.taxAmount) : "—"}</td>
              <td className="py-2.5 text-right text-ink">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="tabular mt-6 ml-auto w-full max-w-xs space-y-1.5 text-[13px]">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(invoice.subtotal)}</dd></div>
        {Number(invoice.discountTotal) > 0 && (
          <div className="flex justify-between"><dt className="text-muted">Discount{invoice.discount ? ` (${invoice.discount.name})` : ""}</dt><dd>− {money(invoice.discountTotal)}</dd></div>
        )}
        <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{money(invoice.taxTotal)}</dd></div>
        <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold text-ink"><dt>Total</dt><dd>{money(invoice.total)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{money(invoice.amountPaid)}</dd></div>
        <div className="flex justify-between font-medium text-ink"><dt>Balance due</dt><dd>{money(invoice.balance)}</dd></div>
      </dl>
    </div>
  );
}
