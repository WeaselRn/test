/**
 * Sessions and authorization guards. Every protected route uses `requirePermission`
 * (or `requireRole`) so access is decided by shared/permissions.ts only.
 *
 * Sessions are random tokens in an httpOnly cookie; the database stores only the
 * SHA-256 of the token, so a leaked database cannot be replayed as sessions.
 */
import { and, eq, gt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { can, type Permission, type Role } from "../../shared/permissions";
import type { SessionUser } from "../../shared/types";
import type { AppEnv } from "../env";
import { randomToken, sha256Hex } from "./crypto";
import { schema, type Database } from "./db";
import { ApiError } from "./errors";

export const SESSION_COOKIE = "bl_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Resolves the signed-in user (or null) for every /api request. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const sessionId = await sha256Hex(token);
    const user = await findSessionUser(c.get("db"), sessionId);
    if (user) {
      c.set("user", user);
      c.set("sessionId", sessionId);
    } else {
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
  }
  await next();
};

async function findSessionUser(db: Database, sessionId: string): Promise<SessionUser | null> {
  const row = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      isActive: schema.users.isActive,
      customerId: schema.customers.id,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.customers, eq(schema.customers.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, new Date().toISOString())))
    .get();
  if (!row || !row.isActive) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, customerId: row.customerId ?? null };
}

export async function startSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await c
    .get("db")
    .insert(schema.sessions)
    .values({ id: await sha256Hex(token), userId, expiresAt: expiresAt.toISOString() });
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    expires: expiresAt,
  });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const sessionId = c.get("sessionId");
  if (sessionId) await c.get("db").delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new ApiError("unauthenticated", "Sign in to continue.");
  await next();
};

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw new ApiError("unauthenticated", "Sign in to continue.");
    if (!can(user.role, permission)) throw ApiError.forbidden();
    await next();
  };
}

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw new ApiError("unauthenticated", "Sign in to continue.");
    if (!roles.includes(user.role)) throw ApiError.forbidden();
    await next();
  };
}

/** The signed-in user; use only behind requireAuth/requirePermission. */
export function currentUser(c: Context<AppEnv>): SessionUser {
  const user = c.get("user");
  if (!user) throw new ApiError("unauthenticated", "Sign in to continue.");
  return user;
}

/**
 * Customer id the signed-in customer may access. Portal queries must always filter
 * by this value, never by an id from the request.
 */
export function ownCustomerId(c: Context<AppEnv>): string {
  const user = currentUser(c);
  if (user.role !== "customer" || !user.customerId) throw ApiError.forbidden();
  return user.customerId;
}
