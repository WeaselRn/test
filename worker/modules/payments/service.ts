/**
 * PAY-1: payment recording with partial and multiple payments per invoice.
 * Owner: Person 3.
 */
import { eq } from "drizzle-orm";
import { toMinor, type Minor } from "../../../shared/money";
import type { PaymentInput } from "../../../shared/schemas";
import type { Payment } from "../../../shared/types";
import { newId, schema, type Database } from "../../lib/db";
import { toPayment } from "../../lib/dto";
import { ApiError } from "../../lib/errors";
import { money } from "../../lib/format";

export async function getOutstandingBalance(db: Database, invoiceId: string): Promise<Minor> {
  const inv = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).get();
  if (!inv) throw ApiError.notFound("Invoice");
  return inv.status === "cancelled" ? 0 : inv.total - inv.amountPaid;
}

/**
 * Record a payment against a Confirmed invoice. The amount cannot exceed the balance.
 * The invoice update and the payment insert run in one atomic batch, and the insert is
 * conditional on the update having applied, so concurrent payments cannot overpay.
 */
export async function recordPayment(db: Database, d1: D1Database, invoiceId: string, input: PaymentInput, actorId: string): Promise<Payment> {
  const inv = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).get();
  if (!inv) throw ApiError.notFound("Invoice");
  if (inv.status === "draft") throw new ApiError("invalid_transition", "Confirm the invoice before recording a payment.");
  if (inv.status === "cancelled") throw new ApiError("invalid_transition", "Payments cannot be recorded against a cancelled invoice.");
  if (inv.status === "paid") throw new ApiError("invalid_transition", "This invoice is already paid in full.");
  const amount = toMinor(input.amount);
  const balance = inv.total - inv.amountPaid;
  if (amount > balance) {
    throw new ApiError("validation_failed", "The payment is more than the balance.", { amount: `Cannot exceed the balance of ${money(balance)}` });
  }
  const newPaid = inv.amountPaid + amount;
  const id = newId();
  const now = new Date().toISOString();
  const results = await d1.batch([
    d1
      .prepare(
        `UPDATE invoices SET amount_paid = ?1,
           status = CASE WHEN ?1 >= total THEN 'paid' ELSE status END,
           paid_at = CASE WHEN ?1 >= total THEN ?2 ELSE paid_at END,
           updated_at = ?2
         WHERE id = ?3 AND amount_paid = ?4 AND status = 'confirmed'`,
      )
      .bind(newPaid, now, invoiceId, inv.amountPaid),
    d1
      .prepare(
        `INSERT INTO payments (id, invoice_id, customer_id, method, amount, paid_on, reference, note, recorded_by, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
         WHERE (SELECT amount_paid FROM invoices WHERE id = ?2) = ?11 AND changes() > 0`,
      )
      .bind(id, invoiceId, inv.customerId, input.method, amount, input.paidOn, input.reference ?? null, input.note ?? null, actorId, now, newPaid),
    d1
      .prepare(
        `INSERT INTO customer_activity (id, customer_id, type, entity, entity_id, summary, actor_id, created_at)
         SELECT ?1, ?2, 'payment.received', 'payment', ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?3)`,
      )
      .bind(newId(), inv.customerId, id, `Payment of ${money(amount)} received for ${inv.number} (${input.method.replace("_", " ")})`, actorId, now),
  ]);
  if (!results[1]?.meta.changes) throw ApiError.conflict("This invoice changed while you were recording the payment. Reload and try again.");
  const row = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).get();
  return toPayment(row!, { invoiceNumber: inv.number });
}

/** Record a receipt that is not matched to an invoice yet (surfaced by leakage detection). */
export async function recordUnmatchedPayment(
  db: Database,
  input: PaymentInput & { customerId?: string | null },
  actorId: string,
): Promise<Payment> {
  const id = newId();
  await db.insert(schema.payments).values({
    id,
    invoiceId: null,
    customerId: input.customerId ?? null,
    method: input.method,
    amount: toMinor(input.amount),
    paidOn: input.paidOn,
    reference: input.reference ?? null,
    note: input.note ?? null,
    recordedBy: actorId,
  });
  const row = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).get();
  return toPayment(row!);
}

/** Match an unmatched receipt to an invoice: records it as a normal payment and removes the receipt. */
export async function matchPayment(db: Database, d1: D1Database, paymentId: string, invoiceId: string, actorId: string): Promise<Payment> {
  const p = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).get();
  if (!p) throw ApiError.notFound("Payment");
  if (p.invoiceId) throw ApiError.conflict("This payment is already matched to an invoice.");
  const matched = await recordPayment(
    db,
    d1,
    invoiceId,
    { method: p.method, amount: (p.amount / 100).toFixed(2), paidOn: p.paidOn, reference: p.reference, note: p.note ?? "Matched receipt" },
    actorId,
  );
  await db.delete(schema.payments).where(eq(schema.payments.id, paymentId));
  return matched;
}
