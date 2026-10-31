import { env, exports } from "cloudflare:workers";
import { hashPassword } from "../../worker/lib/crypto";

export const BASE = "http://localhost/api/v1";

export async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  // Unique client IP per request so auth rate limits do not trip across tests.
  headers.set("cf-connecting-ip", `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`);
  const res = await (exports as unknown as { default: Fetcher }).default.fetch(new Request(`${BASE}${path}`, { ...init, headers }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: sessionCookie(res) };
}

export function sessionCookie(res: Response): string | undefined {
  const raw = res.headers.get("set-cookie");
  const match = raw?.match(/bl_session=([^;]+)/);
  return match && match[1] ? `bl_session=${match[1]}` : undefined;
}

export async function createUser(email: string, role: "admin" | "staff" | "customer", password = "Password!23") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(id, email, await hashPassword(password), email.split("@")[0], role)
    .run();
  return id;
}

export async function login(email: string, password = "Password!23") {
  const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!res.cookie) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.cookie;
}
