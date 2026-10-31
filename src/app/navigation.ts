/**
 * Sidebar navigation by role (PRD §7 "Menu by role"). The menu shows only what the
 * signed-in role may use; the server still checks every request.
 * Each item names its owner so placeholder pages point to the right teammate.
 */
import {
  AlertOctagon,
  BarChart3,
  Boxes,
  CalendarClock,
  CreditCard,
  FileText,
  FlaskConical,
  Gauge,
  HeartPulse,
  LayoutTemplate,
  Layers,
  Percent,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission, Role } from "@shared/permissions";

export type Owner = "Person 1 · Core" | "Person 2 · Catalog & Sales" | "Person 3 · Finance" | "Person 4 · Customer";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  owner: Owner;
  permission?: Permission;
  roles?: readonly Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const P1: Owner = "Person 1 · Core";
const P2: Owner = "Person 2 · Catalog & Sales";
const P3: Owner = "Person 3 · Finance";
const P4: Owner = "Person 4 · Customer";

export const STAFF_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: Gauge, owner: P3, permission: "report:read" },
      { label: "Finance copilot", to: "/copilot", icon: Sparkles, owner: P1, permission: "ai:use" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Subscriptions", to: "/subscriptions", icon: Repeat, owner: P1, permission: "subscription:read" },
      { label: "Quotation templates", to: "/quotation-templates", icon: LayoutTemplate, owner: P2, permission: "template:read" },
      { label: "Customers", to: "/customers", icon: Users, owner: P4, permission: "customer:read" },
      { label: "Renewals", to: "/renewals", icon: CalendarClock, owner: P4, permission: "subscription:read" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Invoices", to: "/invoices", icon: FileText, owner: P3, permission: "invoice:read" },
      { label: "Payments", to: "/payments", icon: CreditCard, owner: P3, permission: "payment:read" },
      { label: "Revenue leakage", to: "/finance/leakage", icon: AlertOctagon, owner: P3, permission: "finding:read" },
      { label: "Customer health", to: "/customers/health", icon: HeartPulse, owner: P4, permission: "customer:read" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", to: "/products", icon: Boxes, owner: P2, permission: "catalog:read" },
      { label: "Plans", to: "/plans", icon: Layers, owner: P2, permission: "catalog:read" },
      { label: "Taxes", to: "/taxes", icon: Receipt, owner: P2, permission: "tax:read" },
      { label: "Discounts", to: "/discounts", icon: Tag, owner: P2, permission: "discount:read" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", to: "/reports", icon: BarChart3, owner: P3, permission: "report:read" },
      { label: "What-if simulator", to: "/simulator", icon: FlaskConical, owner: P4, permission: "report:read" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Staff", to: "/settings/staff", icon: ShieldCheck, owner: P1, permission: "staff:manage" },
      { label: "Profile", to: "/settings/profile", icon: Settings, owner: P1 },
    ],
  },
];

export const PORTAL_NAV: NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "Overview", to: "/portal", icon: Gauge, owner: P4 },
      { label: "My subscriptions", to: "/portal/subscriptions", icon: Repeat, owner: P4 },
      { label: "My invoices", to: "/portal/invoices", icon: FileText, owner: P4 },
      { label: "My payments", to: "/portal/payments", icon: Percent, owner: P4 },
      { label: "Profile", to: "/portal/profile", icon: User, owner: P4 },
    ],
  },
];
