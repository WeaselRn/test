import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, createUser, login } from "./helpers";

describe("auth", () => {
  it("signs up a customer, enforces unique email and password rules", async () => {
    const weak = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: "Asha", email: "asha@example.com", password: "weakpass" }),
    });
    expect(weak.status).toBe(422);
    expect(weak.body.error.fields.password).toBeTruthy();

    const ok = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: "Asha", email: "Asha@Example.com", password: "StrongPass!1" }),
    });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe("customer");
    expect(ok.body.user.customerId).toBeTruthy();
    expect(ok.cookie).toBeTruthy();

    const dup = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: "Asha 2", email: "asha@example.com", password: "StrongPass!1" }),
    });
    expect(dup.status).toBe(409);

    const me = await api("/auth/me", { cookie: ok.cookie });
    expect(me.body.user.email).toBe("asha@example.com");
  });

  it("rejects wrong passwords with a generic message and logs out", async () => {
    await createUser("staff1@example.com", "staff");
    const bad = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "staff1@example.com", password: "Nope!nope1" }),
    });
    expect(bad.status).toBe(401);
    const cookie = await login("staff1@example.com");
    expect((await api("/auth/me", { cookie })).status).toBe(200);
    await api("/auth/logout", { method: "POST", cookie });
    expect((await api("/auth/me", { cookie })).status).toBe(401);
  });

  it("resets a password with a single-use token and answers identically for unknown emails", async () => {
    await createUser("reset@example.com", "customer");
    const unknown = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: "nobody@example.com" }) });
    const known = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: "reset@example.com" }) });
    expect(unknown.body).toEqual(known.body);

    const mail = await env.DB.prepare("SELECT body FROM notifications WHERE recipient = ?1 ORDER BY created_at DESC")
      .bind("reset@example.com")
      .first<{ body: string }>();
    const token = mail?.body.match(/token=([^\s]+)/)?.[1];
    expect(token).toBeTruthy();

    const reset = await api("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: decodeURIComponent(token!), password: "NewPassword!9" }),
    });
    expect(reset.status).toBe(200);
    const reuse = await api("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: decodeURIComponent(token!), password: "OtherPassword!9" }),
    });
    expect(reuse.status).toBe(400);
    await login("reset@example.com", "NewPassword!9");
  });
});

describe("role access", () => {
  it("lets only admins manage staff", async () => {
    await createUser("admin@example.com", "admin");
    await createUser("staff2@example.com", "staff");
    await createUser("cust@example.com", "customer");
    const admin = await login("admin@example.com");
    const staff = await login("staff2@example.com");
    const customer = await login("cust@example.com");

    expect((await api("/staff")).status).toBe(401);
    expect((await api("/staff", { cookie: staff })).status).toBe(403);
    expect((await api("/staff", { cookie: customer })).status).toBe(403);

    const created = await api("/staff", {
      method: "POST",
      cookie: admin,
      body: JSON.stringify({ name: "New Staff", email: "new@example.com", password: "StaffPass!1" }),
    });
    expect(created.status).toBe(201);
    const createByStaff = await api("/staff", {
      method: "POST",
      cookie: staff,
      body: JSON.stringify({ name: "X", email: "x@example.com", password: "StaffPass!1" }),
    });
    expect(createByStaff.status).toBe(403);

    const disabled = await api(`/staff/${created.body.data.id}`, {
      method: "PATCH",
      cookie: admin,
      body: JSON.stringify({ isActive: false }),
    });
    expect(disabled.body.data.isActive).toBe(false);
    const blocked = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "StaffPass!1" }),
    });
    expect(blocked.status).toBe(403);
  });
});
