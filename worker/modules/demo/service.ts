/**
 * Demo scenario loader (SYS-1 demo data). Owner: Person 4.
 * Builds six months of history through the real services (subscriptions, billing,
 * payments, retention), so the demo exercises production code paths. Every record it
 * creates is ordinary data; customers are named "(demo)" so they are clearly labelled.
 * Available only when DEMO_MODE=true and the database has no subscriptions yet.
 */
import { addDays, addMonths, todayISO } from "../../../shared/dates";
import { fromMinor } from "../../../shared/money";
import { newId, type Database } from "../../lib/db";
import { ApiError } from "../../lib/errors";
import { all, first } from "../../lib/sql";
import { runBilling } from "../billing/service";
import { runDunning } from "../dunning/service";
import { scanInvoiceAnomalies, scanRevenueLeakage } from "../finance/detection";
import { recordPayment, recordUnmatchedPayment } from "../payments/service";
import { scanRenewals } from "../renewals/service";
import { requestCancellation } from "../retention/service";
import { createSubscription, transitionSubscription } from "../subscriptions/service";

const COMPANIES = [
  "Acme Labs", "Northwind Traders", "Globex Corp", "Initech", "Umbrella Health", "Stark Logistics", "Wayne Retail",
  "Hooli Cloud", "Pied Piper", "Soylent Foods", "Vandelay Imports", "Tyrell Systems", "Cyberdyne Analytics", "Oscorp Media",
];

/** Small deterministic PRNG so every demo load is identical. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

export async function loadDemoData(db: Database, env: Env, actorId: string) {
  if (env.DEMO_MODE !== "true") throw ApiError.forbidden("Demo data can be loaded in demo mode only.");
  const existing = await first<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM subscriptions`);
  if (existing && existing.n > 0) throw ApiError.conflict("Demo data needs an empty database. Run `npm run db:reset:local` first.");

  const today = todayISO();
  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

  // Customers: reuse the seeded ones, then add demo companies.
  const customers = await all<{ id: string; company_name: string | null }>(env.DB, `SELECT id, company_name FROM customers ORDER BY created_at`);
  const stmt = env.DB.prepare(`INSERT OR IGNORE INTO customers (id, email, contact_name, company_name, phone, billing_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`);
  const extra = COMPANIES.filter((c) => !customers.some((x) => x.company_name === c)).map((company, i) => ({
    id: newId(),
    email: `billing@${company.toLowerCase().replace(/[^a-z]/g, "")}.test`,
    contact: ["Meera Iyer", "Arjun Rao", "Kavya Shah", "Rohan Gupta", "Ananya Das", "Vikram Joshi", "Neha Kapoor"][i % 7]!,
    company: `${company} (demo)`,
  }));
  if (extra.length) await env.DB.batch(extra.map((c) => stmt.bind(c.id, c.email, c.contact, c.company, "+91 90000 00000", "Demo address, India")));
  const allCustomers = [...customers.map((c) => c.id), ...extra.map((c) => c.id)];

  const plans = await all<{ id: string; billing_period: string; pausable: number }>(env.DB, `SELECT id, billing_period, pausable FROM plans WHERE status = 'active'`);
  const products = await all<{ id: string }>(env.DB, `SELECT id FROM products WHERE is_active = 1`);
  const variants = await all<{ id: string; product_id: string }>(env.DB, `SELECT id, product_id FROM product_variants`);
  const monthly = plans.find((p) => p.billing_period === "monthly") ?? plans[0]!;
  const yearly = plans.find((p) => p.billing_period === "yearly");

  // 1. Subscriptions started 1–6 months ago.
  const subs: { id: string; customerId: string }[] = [];
  for (const [i, customerId] of allCustomers.entries()) {
    const plan = i % 6 === 5 && yearly ? yearly : monthly;
    const startDate = addDays(addMonths(today, -(1 + Math.floor(rand() * 6))), -Math.floor(rand() * 20));
    const product = pick(products);
    const variant = variants.find((v) => v.product_id === product.id && rand() > 0.5);
    const expiryDate = i === 1 ? addDays(today, 6) : i === 3 ? addDays(today, 24) : null; // renewals due soon
    const sub = await createSubscription(
      db,
      env.DB,
      { customerId, planId: plan.id, startDate, expiryDate, paymentTermDays: 15, lines: [{ productId: product.id, variantId: variant?.id ?? null, quantity: 1 + Math.floor(rand() * 6) }] },
      actorId,
    );
    await transitionSubscription(db, sub.id, "quotation", actorId, null, today);
    await transitionSubscription(db, sub.id, "confirmed", actorId, "Accepted (demo)", today);
    subs.push({ id: sub.id, customerId });
  }

  // 2. Replay billing month by month so invoices carry historical dates.
  for (let m = 6; m >= 1; m--) await runBilling(db, env.DB, { today: addMonths(today, -m), trigger: "manual", actorId });
  await runBilling(db, env.DB, { today, trigger: "manual", actorId });

  // 3. Confirm everything issued before today, keeping the historical issue/due dates.
  await env.DB.prepare(`UPDATE invoices SET status = 'confirmed', confirmed_at = issue_date WHERE status = 'draft' AND issue_date < ?1`).bind(today).run();

  // 4. Payments: most invoices paid on time; Globex pays late; Northwind leaves two overdue.
  const invoices = await all<{ id: string; customer_id: string; total: number; due_date: string; issue_date: string; company: string | null }>(
    env.DB,
    `SELECT i.id, i.customer_id, i.total, i.due_date, i.issue_date, c.company_name AS company
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.status = 'confirmed' ORDER BY i.issue_date`,
  );
  const lastByCustomer = new Map<string, string>();
  for (const inv of invoices) lastByCustomer.set(inv.customer_id, inv.id);
  let paid = 0;
  for (const inv of invoices) {
    const company = inv.company ?? "";
    const isLast = lastByCustomer.get(inv.customer_id) === inv.id;
    if (company.startsWith("Northwind") && inv.due_date < today && invoices.filter((x) => x.customer_id === inv.customer_id).slice(-2).some((x) => x.id === inv.id)) continue;
    if (isLast && inv.due_date >= today) continue; // current period still open
    if (isLast && rand() < 0.25) continue; // a few ordinary overdue invoices
    const late = company.startsWith("Globex") ? 9 + Math.floor(rand() * 12) : -Math.floor(rand() * 10);
    const paidOn = addDays(inv.due_date, late) > today ? today : addDays(inv.due_date, late);
    const partial = rand() < 0.1;
    const amount = partial ? Math.round(inv.total / 2) : inv.total;
    await recordPayment(db, env.DB, inv.id, { method: pick(["bank_transfer", "upi", "card", "upi"] as const), amount: fromMinor(amount), paidOn, reference: `UTR${100000 + paid}`, note: null }, actorId);
    paid++;
  }

  // 5. Leakage scenarios.
  await recordUnmatchedPayment(db, { method: "bank_transfer", amount: "12980.00", paidOn: addDays(today, -4), reference: "UTR-UNKNOWN-7781", note: "Receipt without invoice reference", customerId: allCustomers[2] ?? null }, actorId);
  // A subscription whose first period was never billed (started after the last run).
  const late = await createSubscription(db, env.DB, { customerId: allCustomers[4]!, planId: monthly.id, startDate: addDays(today, -12), paymentTermDays: 15, lines: [] }, actorId);
  await transitionSubscription(db, late.id, "quotation", actorId, null, today);
  await transitionSubscription(db, late.id, "confirmed", actorId, null, today);
  // The welcome discount's end date was moved before invoices that still used it.
  await env.DB.prepare(`UPDATE discounts SET ends_on = ?1 WHERE id = 'seed-disc-welcome'`).bind(addMonths(today, -2)).run();

  // 6. A price-driven cancellation request awaiting the customer's decision.
  const cancelSub = subs[6] ?? subs[0]!;
  await requestCancellation(db, cancelSub.id, cancelSub.customerId, { reason: "too_expensive", comment: "Budget cut this quarter (demo)" }, actorId);

  // 7. Run the daily jobs so findings, reminders and renewal tasks exist.
  const ctx = { db, env, today };
  // Reminders and renewals first, so leakage only flags what dunning could not chase.
  const dunning = await runDunning(ctx);
  const renewals = await scanRenewals(ctx);
  const leakage = await scanRevenueLeakage(ctx);
  const anomalies = await scanInvoiceAnomalies(ctx);
  return { customers: allCustomers.length, subscriptions: subs.length + 1, invoices: invoices.length, payments: paid, leakage, anomalies, renewals, dunning };
}
