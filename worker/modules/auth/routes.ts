/**
 * AUTH-1, AUTH-2: signup, login, logout, session, forgot/reset password.
 * Owner: Person 1 (core backend).
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "../../../shared/schemas";
import type { AppEnv } from "../../env";
import { currentUser, endSession, requireAuth, startSession } from "../../lib/auth";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../../lib/crypto";
import { newId, nowISO, schema } from "../../lib/db";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import { activityEntry, auditEntry } from "../../lib/events";
import { sendEmail } from "../../lib/notifications";
import { rateLimit } from "../../lib/rate-limit";
import { validate } from "../../lib/validate";

const RESET_TTL_MS = 30 * 60 * 1000;

export const authRoutes = new Hono<AppEnv>()
  .post("/signup", rateLimit({ name: "signup", limit: 10, windowSeconds: 600 }), validate("json", signupSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");

    const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email)).get();
    if (existing) throw ApiError.conflict("An account with this email already exists.", { email: "Email is already registered" });

    const userId = newId();
    const passwordHash = await hashPassword(input.password);
    // PRD assumption: a customer record created by staff is linked when someone signs up with the same email.
    const staffCreated = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(eq(schema.customers.email, input.email), isNull(schema.customers.userId)))
      .get();
    const customerId = staffCreated?.id ?? newId();

    try {
      await db.batch([
        db.insert(schema.users).values({ id: userId, email: input.email, passwordHash, name: input.name, role: "customer" }),
        staffCreated
          ? db.update(schema.customers).set({ userId, updatedAt: nowISO() }).where(eq(schema.customers.id, customerId))
          : db.insert(schema.customers).values({
              id: customerId,
              userId,
              email: input.email,
              contactName: input.name,
              companyName: input.companyName ?? null,
            }),
        activityEntry(db, { customerId, type: "customer.registered", summary: `${input.name} created a portal account`, actorId: userId }),
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw ApiError.conflict("An account with this email already exists.", { email: "Email is already registered" });
      throw err;
    }

    await startSession(c, userId);
    return c.json({ user: { id: userId, email: input.email, name: input.name, role: "customer" as const, customerId } }, 201);
  })

  .post("/login", rateLimit({ name: "login", limit: 10, windowSeconds: 300 }), validate("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const db = c.get("db");
    const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    // Same message for unknown email and wrong password.
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) throw new ApiError("unauthenticated", "Email or password is incorrect.");
    if (!user.isActive) throw ApiError.forbidden("This account is disabled. Contact your administrator.");

    await startSession(c, user.id);
    const customer = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.userId, user.id)).get();
    return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, customerId: customer?.id ?? null } });
  })

  .post("/logout", async (c) => {
    await endSession(c);
    return c.body(null, 204);
  })

  .get("/me", requireAuth, (c) => c.json({ user: currentUser(c) }))

  .post(
    "/forgot-password",
    rateLimit({ name: "forgot", limit: 5, windowSeconds: 900 }),
    validate("json", forgotPasswordSchema),
    async (c) => {
      const { email } = c.req.valid("json");
      const db = c.get("db");
      const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
      if (user?.isActive) {
        const token = randomToken();
        await db.insert(schema.passwordResetTokens).values({
          id: newId(),
          userId: user.id,
          tokenHash: await sha256Hex(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
        });
        const link = `${c.env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
        await sendEmail(db, c.env, {
          to: user.email,
          userId: user.id,
          subject: "Reset your Brightloop password",
          body: `Hi ${user.name},\n\nUse this link to set a new password. It works once and expires in 30 minutes.\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
          entity: "user",
          entityId: user.id,
        });
      }
      // Identical response whether or not the email exists.
      return c.json({ message: "If an account exists for this email, a reset link is on its way." });
    },
  )

  .post(
    "/reset-password",
    rateLimit({ name: "reset", limit: 10, windowSeconds: 900 }),
    validate("json", resetPasswordSchema),
    async (c) => {
      const { token, password } = c.req.valid("json");
      const db = c.get("db");
      const now = nowISO();
      const row = await db
        .select()
        .from(schema.passwordResetTokens)
        .where(
          and(
            eq(schema.passwordResetTokens.tokenHash, await sha256Hex(token)),
            isNull(schema.passwordResetTokens.usedAt),
            gt(schema.passwordResetTokens.expiresAt, now),
          ),
        )
        .get();
      if (!row) throw new ApiError("bad_request", "This reset link is invalid or has expired. Request a new one.");

      const passwordHash = await hashPassword(password);
      await db.batch([
        db.update(schema.users).set({ passwordHash, updatedAt: now }).where(eq(schema.users.id, row.userId)),
        db.update(schema.passwordResetTokens).set({ usedAt: now }).where(eq(schema.passwordResetTokens.id, row.id)),
        // Sign out every existing session after a password change.
        db.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId)),
        auditEntry(db, { actorId: row.userId, action: "password.reset", entity: "user", entityId: row.userId }),
      ]);
      return c.json({ message: "Password updated. Sign in with your new password." });
    },
  );
