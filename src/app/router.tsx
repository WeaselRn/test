/**
 * Route table. Pages load lazily per module so each owner's code ships in its own
 * chunk. Guards here only decide what to render; the API enforces access.
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Link, Navigate } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, FullPageSpinner, Page, Skeleton } from "@/components/ui";
import { homePathFor, RequirePermission, RequireRole, useSession } from "@/lib/auth";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "@/modules/auth/pages";
import type { Permission } from "@shared/permissions";
import { PORTAL_NAV, STAFF_NAV } from "./navigation";

/** Lazy-load a named export from a module file. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  const C = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return (
    <Suspense fallback={<Page><Skeleton className="h-72" /></Page>}>
      <C />
    </Suspense>
  );
}

const guard = (permission: Permission, el: ReactNode) => <RequirePermission permission={permission}>{el}</RequirePermission>;

// Person 1
const subscriptions = () => import("@/modules/subscriptions/pages");
const billing = () => import("@/modules/billing/pages");
const copilot = () => import("@/modules/copilot/pages");
const staff = () => import("@/modules/staff/staff-page");
const profile = () => import("@/modules/staff/profile-page");
// Person 2
const products = () => import("@/modules/products/pages");
const plans = () => import("@/modules/plans/pages");
const taxes = () => import("@/modules/taxes/pages");
const discounts = () => import("@/modules/discounts/pages");
const quotations = () => import("@/modules/quotations/pages");
// Person 3
const reports = () => import("@/modules/reports/pages");
const invoices = () => import("@/modules/invoices/pages");
const payments = () => import("@/modules/payments/pages");
const finance = () => import("@/modules/finance/pages");
// Person 4
const customers = () => import("@/modules/customers/pages");
const health = () => import("@/modules/customer-health/pages");
const dunning = () => import("@/modules/dunning/pages");
const renewals = () => import("@/modules/renewals/pages");
const retention = () => import("@/modules/retention/pages");
const simulator = () => import("@/modules/simulator/pages");
const portal = () => import("@/modules/customer-portal/pages");

function RootRedirect() {
  const { user, isLoading } = useSession();
  if (isLoading) return <FullPageSpinner />;
  return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <EmptyState
      className="min-h-[60vh]"
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={<Link to="/" className="text-[13px] font-medium text-primary hover:underline">Go home</Link>}
    />
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <GuestOnly><LoginPage /></GuestOnly> },
  { path: "/signup", element: <GuestOnly><SignupPage /></GuestOnly> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: (
      <RequireRole roles={["admin", "staff"]}>
        <AppShell nav={STAFF_NAV} />
      </RequireRole>
    ),
    children: [
      // Person 1 — core
      { path: "/subscriptions", element: page(subscriptions, "SubscriptionsPage") },
      { path: "/subscriptions/new", element: page(subscriptions, "SubscriptionFormPage") },
      { path: "/subscriptions/:id", element: page(subscriptions, "SubscriptionDetailPage") },
      { path: "/subscriptions/:id/edit", element: page(subscriptions, "SubscriptionFormPage") },
      { path: "/billing", element: guard("billing:run", page(billing, "BillingPage")) },
      { path: "/copilot", element: guard("ai:use", page(copilot, "CopilotPage")) },
      { path: "/settings/staff", element: guard("staff:manage", page(staff, "StaffPage")) },
      { path: "/settings/profile", element: page(profile, "ProfilePage") },
      // Person 2 — catalog & sales
      { path: "/products", element: page(products, "ProductsPage") },
      { path: "/products/variants", element: page(products, "VariantsPage") },
      { path: "/products/:id", element: page(products, "ProductFormPage") },
      { path: "/plans", element: page(plans, "PlansPage") },
      { path: "/taxes", element: page(taxes, "TaxesPage") },
      { path: "/discounts", element: page(discounts, "DiscountsPage") },
      { path: "/quotations", element: page(quotations, "QuotationsPage") },
      { path: "/quotation-templates", element: page(quotations, "TemplatesPage") },
      { path: "/quotation-templates/:id", element: page(quotations, "TemplateFormPage") },
      // Person 3 — finance
      { path: "/dashboard", element: guard("report:read", page(reports, "DashboardPage")) },
      { path: "/reports", element: guard("report:read", page(reports, "ReportsPage")) },
      { path: "/invoices", element: page(invoices, "InvoicesPage") },
      { path: "/invoices/:id", element: page(invoices, "InvoiceDetailPage") },
      { path: "/payments", element: page(payments, "PaymentsPage") },
      { path: "/payments/outstanding", element: page(payments, "OutstandingPage") },
      { path: "/finance/leakage", element: guard("finding:read", page(finance, "LeakagePage")) },
      // Person 4 — customer
      { path: "/customers", element: page(customers, "CustomersPage") },
      { path: "/customers/health", element: page(health, "HealthPage") },
      { path: "/customers/:id", element: page(customers, "CustomerDetailPage") },
      { path: "/dunning", element: page(dunning, "DunningPage") },
      { path: "/renewals", element: page(renewals, "RenewalsPage") },
      { path: "/retention", element: page(retention, "RetentionPage") },
      { path: "/simulator", element: guard("report:read", page(simulator, "SimulatorPage")) },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    path: "/portal",
    element: (
      <RequireRole roles={["customer"]}>
        <AppShell nav={PORTAL_NAV} portal />
      </RequireRole>
    ),
    children: [
      { index: true, element: page(portal, "PortalOverviewPage") },
      { path: "subscriptions", element: page(portal, "PortalSubscriptionsPage") },
      { path: "subscriptions/:id", element: page(portal, "PortalSubscriptionDetailPage") },
      { path: "invoices", element: page(portal, "PortalInvoicesPage") },
      { path: "invoices/:id", element: page(portal, "PortalInvoiceDetailPage") },
      { path: "payments", element: page(portal, "PortalPaymentsPage") },
      { path: "profile", element: page(portal, "PortalProfilePage") },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
