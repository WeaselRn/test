/**
 * Role capability matrix (PRD §2). Single source of truth for the API guards and
 * for which navigation items the UI shows. Never decide access anywhere else.
 */

export const ROLES = ["admin", "staff", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "staff:manage": ["admin"],
  "catalog:read": ["admin", "staff"],
  "catalog:write": ["admin"], // products, variants, plans
  "tax:read": ["admin", "staff"],
  "tax:write": ["admin"],
  "discount:read": ["admin", "staff"],
  "discount:write": ["admin"],
  "template:read": ["admin", "staff"],
  "template:write": ["admin", "staff"],
  "customer:read": ["admin", "staff"],
  "customer:write": ["admin", "staff"],
  "subscription:read": ["admin", "staff"],
  "subscription:write": ["admin", "staff"],
  "invoice:read": ["admin", "staff"],
  "invoice:write": ["admin", "staff"],
  "billing:run": ["admin", "staff"],
  "payment:read": ["admin", "staff"],
  "payment:write": ["admin", "staff"],
  "report:read": ["admin", "staff"],
  "finding:read": ["admin", "staff"],
  "finding:write": ["admin", "staff"],
  "settings:write": ["admin"],
  "ai:use": ["admin", "staff"],
  "portal:access": ["customer"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
