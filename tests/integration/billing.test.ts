import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addDays, addMonths, todayISO } from "../../shared/dates";
import { api, createUser, login } from "./helpers";

async function seedCatalog() {
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO taxes (id, name, kind, rate) VALUES ('tax18', 'GST 18%', 'percentage', 1800)`),
    env.DB.prepare(`INSERT OR IGNORE INTO products (id, name, type, sales_price, cost_price) VALUES ('prod1', 'CRM', 'software', 200000, 0)`),
    env.DB.prepare(`INSERT OR IGNORE INTO product_variants (id, product_id, attribute, value, extra_price) VALUES ('var1', 'prod1', 'Brand', 'Odoo', 56000)`),
    env.DB.prepare(`INSERT OR IGNORE INTO product_taxes (product_id, tax_id) VALUES ('prod1', 'tax18')`),
    env.DB.prepare(
      `INSERT OR IGNORE INTO plans (id, name, price, billing_period, min_quantity, available_from, closable, pausable, renewable)
       VALUES ('plan1', 'Monthly', 100000, 'monthly', 1, '2020-01-01', 1, 1, 1)`,
    ),
    env.DB.prepare(`INSERT OR IGNORE INTO customers (id, email, contact_name, company_name) VALUES ('cust1', 'a@example.com', 'Asha', 'Acme')`),
  ]);
}

describe("billing run", () => {
  it("bills every missed period once, never twice, and prices lines correctly", async () => {
    await seedCatalog();
    await createUser("billing-admin@example.com", "admin");
    const admin = await login("billing-admin@example.com");
    const start = addMonths(todayISO(), -2);

    const created = await api("/subscriptions", {
      method: "POST",
      cookie: admin,
      body: JSON.stringify({ customerId: "cust1", planId: "plan1", startDate: start, paymentTermDays: 15, lines: [{ productId: "prod1", variantId: "var1", quantity: 2 }] }),
    });
    expect(created.status).toBe(201);
    const sub = created.body.data;
    // 2 × (2000 + 560) = 5120, + 18% tax = 6041.60
    expect(sub.lines[0].unitPrice).toBe("2560.00");
    expect(sub.lines[0].amount).toBe("6041.60");

    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "quotation" }) });
    const confirmed = await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "confirmed" }) });
    expect(confirmed.body.data.status).toBe("active"); // start date has passed

    const first = await api("/billing/run", { method: "POST", cookie: admin, body: "{}" });
    expect(first.body.data.created).toBe(3); // periods starting start, start+1m, start+2m (= today)
    const second = await api("/billing/run", { method: "POST", cookie: admin, body: "{}" });
    expect(second.body.data.created).toBe(0);

    const count = await env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT period_start) AS d FROM invoices WHERE subscription_id = ?1`)
      .bind(sub.id)
      .first<{ n: number; d: number }>();
    expect(count).toEqual({ n: 3, d: 3 });

    const list = await api(`/invoices?subscriptionId=${sub.id}&sort=issueDate`, { cookie: admin });
    // plan fee 1000 + lines 6041.60
    expect(list.body.data[0].total).toBe("7041.60");
  });

  it("records partial payments, blocks overpayment, and marks the invoice paid", async () => {
    await seedCatalog();
    await createUser("billing-staff@example.com", "staff");
    const staff = await login("billing-staff@example.com");
    const sub = (
      await api("/subscriptions", {
        method: "POST",
        cookie: staff,
        body: JSON.stringify({ customerId: "cust1", planId: "plan1", startDate: todayISO(), lines: [] }),
      })
    ).body.data;
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: staff, body: JSON.stringify({ to: "quotation" }) });
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: staff, body: JSON.stringify({ to: "confirmed" }) });
    await api("/billing/run", { method: "POST", cookie: staff, body: "{}" });
    const inv = (await api(`/invoices?subscriptionId=${sub.id}`, { cookie: staff })).body.data[0];

    const draftPay = await api(`/invoices/${inv.id}/payments`, {
      method: "POST",
      cookie: staff,
      body: JSON.stringify({ method: "upi", amount: "100.00", paidOn: todayISO() }),
    });
    expect(draftPay.status).toBe(409);

    await api(`/invoices/${inv.id}/confirm`, { method: "POST", cookie: staff });
    const pay = (amount: string) =>
      api(`/invoices/${inv.id}/payments`, { method: "POST", cookie: staff, body: JSON.stringify({ method: "upi", amount, paidOn: todayISO() }) });
    expect((await pay("400.00")).status).toBe(201);
    expect((await pay("700.00")).status).toBe(422);
    expect((await pay("600.00")).status).toBe(201);
    const after = (await api(`/invoices/${inv.id}`, { cookie: staff })).body.data;
    expect(after.status).toBe("paid");
    expect(after.balance).toBe("0.00");
    expect(after.payments).toHaveLength(2);
  });

  it("cancelling an invoice releases its discount usage", async () => {
    await seedCatalog();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO discounts (id, name, kind, value, starts_on, usage_limit, usage_count, scope) VALUES ('d1', 'Ten', 'percentage', 1000, '2020-01-01', 5, 0, 'subscription')`,
    ).run();
    await createUser("admin2@example.com", "admin");
    const admin = await login("admin2@example.com");
    const sub = (
      await api("/subscriptions", { method: "POST", cookie: admin, body: JSON.stringify({ customerId: "cust1", planId: "plan1", startDate: todayISO(), lines: [] }) })
    ).body.data;
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "quotation" }) });
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "confirmed" }) });
    await api("/billing/run", { method: "POST", cookie: admin, body: "{}" });
    const inv = (await api(`/invoices?subscriptionId=${sub.id}`, { cookie: admin })).body.data[0];
    expect(inv.discountTotal).toBe("100.00");
    expect((await env.DB.prepare(`SELECT usage_count AS n FROM discounts WHERE id = 'd1'`).first<{ n: number }>())?.n).toBe(1);
    await api(`/invoices/${inv.id}/cancel`, { method: "POST", cookie: admin, body: "{}" });
    expect((await env.DB.prepare(`SELECT usage_count AS n FROM discounts WHERE id = 'd1'`).first<{ n: number }>())?.n).toBe(0);
  });

  it("blocks plan-forbidden pauses and expired quotations", async () => {
    await seedCatalog();
    await env.DB.prepare(`UPDATE plans SET pausable = 0 WHERE id = 'plan1'`).run();
    await createUser("admin3@example.com", "admin");
    const admin = await login("admin3@example.com");
    const sub = (
      await api("/subscriptions", { method: "POST", cookie: admin, body: JSON.stringify({ customerId: "cust1", planId: "plan1", startDate: todayISO(), lines: [] }) })
    ).body.data;
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "quotation" }) });
    await env.DB.prepare(`UPDATE subscriptions SET quote_valid_until = ?1 WHERE id = ?2`).bind(addDays(todayISO(), -1), sub.id).run();
    const expired = await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "confirmed" }) });
    expect(expired.status).toBe(409);
    await env.DB.prepare(`UPDATE subscriptions SET quote_valid_until = NULL WHERE id = ?1`).bind(sub.id).run();
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "confirmed" }) });
    const pause = await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "paused" }) });
    expect(pause.status).toBe(409);
  });
});

describe("customer portal isolation", () => {
  it("shows customers only their own records", async () => {
    await seedCatalog();
    await createUser("admin4@example.com", "admin");
    const admin = await login("admin4@example.com");
    const a = await api("/auth/signup", { method: "POST", body: JSON.stringify({ name: "A", email: "a@example.com", password: "StrongPass!1" }) });
    const b = await api("/auth/signup", { method: "POST", body: JSON.stringify({ name: "B", email: "b@example.com", password: "StrongPass!1" }) });
    // a@example.com links to the staff-created customer cust1.
    expect(a.body.user.customerId).toBe("cust1");

    const sub = (
      await api("/subscriptions", { method: "POST", cookie: admin, body: JSON.stringify({ customerId: "cust1", planId: "plan1", startDate: todayISO(), lines: [] }) })
    ).body.data;
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "quotation" }) });
    await api(`/subscriptions/${sub.id}/transition`, { method: "POST", cookie: admin, body: JSON.stringify({ to: "confirmed" }) });
    await api("/billing/run", { method: "POST", cookie: admin, body: "{}" });
    const inv = (await api(`/invoices?subscriptionId=${sub.id}`, { cookie: admin })).body.data[0];
    await api(`/invoices/${inv.id}/confirm`, { method: "POST", cookie: admin });

    expect((await api(`/portal/invoices/${inv.id}`, { cookie: a.cookie })).status).toBe(200);
    expect((await api(`/portal/invoices/${inv.id}`, { cookie: b.cookie })).status).toBe(404);
    expect((await api(`/portal/subscriptions/${sub.id}`, { cookie: b.cookie })).status).toBe(404);
    expect((await api(`/portal/invoices`, { cookie: b.cookie })).body.total).toBe(0);
    expect((await api(`/invoices`, { cookie: a.cookie })).status).toBe(403);
    expect((await api(`/portal/summary`, { cookie: admin })).status).toBe(403);
  });
});
