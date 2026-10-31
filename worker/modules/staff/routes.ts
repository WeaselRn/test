/**
 * AUTH-4: admin-only creation, disabling and role view of staff members.
 * Owner: Person 1 (core backend).
 */
import { and, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { listQuerySchema } from "../../../shared/api";
import { createStaffSchema, updateStaffSchema } from "../../../shared/schemas";
import type { StaffMember } from "../../../shared/types";
import type { AppEnv } from "../../env";
import { currentUser, requirePermission } from "../../lib/auth";
import { hashPassword } from "../../lib/crypto";
import { newId, nowISO, schema } from "../../lib/db";
import { ApiError, isUniqueViolation } from "../../lib/errors";
import { auditEntry } from "../../lib/events";
import { orderBy, pageOffset, paginated } from "../../lib/pagination";
import { validate } from "../../lib/validate";

const { users } = schema;

const staffColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export const staffRoutes = new Hono<AppEnv>()
  .use(requirePermission("staff:manage"))

  .get("/", validate("query", listQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const db = c.get("db");
    const where = and(
      inArray(users.role, ["admin", "staff"]),
      q.q ? or(like(users.name, `%${q.q}%`), like(users.email, `%${q.q}%`)) : undefined,
    );
    const [rows, total] = await Promise.all([
      db
        .select(staffColumns)
        .from(users)
        .where(where)
        .orderBy(orderBy(q.sort, { name: users.name, email: users.email, createdAt: users.createdAt }, sql`${users.createdAt} desc`))
        .limit(pageOffset(q).limit)
        .offset(pageOffset(q).offset),
      db.select({ n: count() }).from(users).where(where).get(),
    ]);
    return c.json(paginated(rows as StaffMember[], q, total?.n ?? 0));
  })

  .post("/", validate("json", createStaffSchema), async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const id = newId();
    try {
      await db.batch([
        db.insert(users).values({
          id,
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        }),
        auditEntry(db, { actorId: currentUser(c).id, action: "staff.created", entity: "user", entityId: id, meta: { role: input.role } }),
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw ApiError.conflict("An account with this email already exists.", { email: "Email is already registered" });
      throw err;
    }
    const created = await db.select(staffColumns).from(users).where(eq(users.id, id)).get();
    return c.json({ data: created as StaffMember }, 201);
  })

  .patch("/:id", validate("json", updateStaffSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = c.get("db");
    const actor = currentUser(c);
    const target = await db.select().from(users).where(eq(users.id, id)).get();
    if (!target || target.role === "customer") throw ApiError.notFound("Staff member");
    if (id === actor.id && (input.isActive === false || (input.role && input.role !== "admin"))) {
      throw new ApiError("bad_request", "You cannot disable or demote your own account.");
    }

    await db.batch([
      db.update(users).set({ ...input, updatedAt: nowISO() }).where(eq(users.id, id)),
      ...(input.isActive === false ? [db.delete(schema.sessions).where(eq(schema.sessions.userId, id))] : []),
      auditEntry(db, { actorId: actor.id, action: "staff.updated", entity: "user", entityId: id, meta: input }),
    ]);
    const updated = await db.select(staffColumns).from(users).where(eq(users.id, id)).get();
    return c.json({ data: updated as StaffMember });
  });
