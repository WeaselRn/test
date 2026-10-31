/**
 * Sidebar navigation by role (PRD §7 "Menu by role"). The menu shows only what the
 * signed-in role may use; the server still checks every request.
 * Each item names its owner so reviewers know who to ask.
 */
import {
  AlertOctagon,
  BarChart3,
  BellRing,
  Boxes,
  CalendarClock,
  CreditCard,
  FileClock,
  FileText,
  FlaskConical,
  Gauge,
  HeartPulse,
  LayoutTemplate,
  Layers,
  LifeBuoy,
  PlayCircle,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  Users,
  Wallet,
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
  /** Match the path exactly (for parents of other nav items). */
  end?: boolean;
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
      { label: "Quotations", to: "/quotations", icon: FileClock, owner: P2, permission: "subscription:read" },
      { label: "Quotation templates", to: "/quotation-templates", icon: LayoutTemplate, owner: P2, permission: "template:read" },
    ],
  },
  {
    label: "Subscriptions",
    items: [
      { label: "All subscriptions", to: "/subscriptions", icon: Repeat, owner: P1, permission: "subscription:read" },
      { label: "Plans", to: "/plans", icon: Layers, owner: P2, permission: "catalog:read" },
      { label: "Renewals", to: "/renewals", icon: CalendarClock, owner: P4, permission: "subscription:read" },
      { label: "Retention", to: "/retention", icon: LifeBuoy, owner: P4, permission: "subscription:read" },
    ],
  },
  {
    label: "Products",
    items: [
      { label: "Products", to: "/products", icon: Boxes, owner: P2, permission: "catalog:read", end: true },
      { label: "Variants", to: "/products/variants", icon: Tag, owner: P2, permission: "catalog:read" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Invoices", to: "/invoices", icon: FileText, owner: P3, permission: "invoice:read" },
      { label: "Billing runs", to: "/billing", icon: PlayCircle, owner: P1, permission: "billing:run" },
      { label: "Taxes", to: "/taxes", icon: Receipt, owner: P2, permission: "tax:read" },
      { label: "Discount rules", to: "/discounts", icon: Tag, owner: P2, permission: "discount:read" },
    ],
  },
  {
    label: "Payments",
    items: [
      { label: "Payments", to: "/payments", icon: CreditCard, owner: P3, permission: "payment:read", end: true },
      { label: "Outstanding invoices", to: "/payments/outstanding", icon: Wallet, owner: P3, permission: "payment:read" },
      { label: "Dunning", to: "/dunning", icon: BellRing, owner: P4, permission: "invoice:read" },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Customer directory", to: "/customers", icon: Users, owner: P4, permission: "customer:read", end: true },
      { label: "Customer health", to: "/customers/health", icon: HeartPulse, owner: P4, permission: "customer:read" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", to: "/reports", icon: BarChart3, owner: P3, permission: "report:read" },
      { label: "Revenue leakage", to: "/finance/leakage", icon: AlertOctagon, owner: P3, permission: "finding:read" },
      { label: "What-if simulator", to: "/simulator", icon: FlaskConical, owner: P4, permission: "report:read" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Staff", to: "/settings/staff", icon: ShieldCheck, owner: P1, permission: "staff:manage" },
      { label: "Roles & profile", to: "/settings/profile", icon: Settings, owner: P1 },
    ],
  },
];

export const PORTAL_NAV: NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "Overview", to: "/portal", icon: Gauge, owner: P4, end: true },
      { label: "My subscriptions", to: "/portal/subscriptions", icon: Repeat, owner: P4 },
      { label: "My invoices", to: "/portal/invoices", icon: FileText, owner: P4 },
      { label: "My payments", to: "/portal/payments", icon: CreditCard, owner: P4 },
      { label: "Profile", to: "/portal/profile", icon: User, owner: P4 },
    ],
  },
];
