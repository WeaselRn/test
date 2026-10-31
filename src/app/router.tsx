/**
 * Route table. Each owner replaces their <ModulePlaceholder /> with the real page in
 * their PR. Guards here only decide what to render; the API enforces access.
 */
import { createBrowserRouter, Link, Navigate } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { EmptyState, FullPageSpinner } from "@/components/ui";
import { homePathFor, RequirePermission, RequireRole, useSession } from "@/lib/auth";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "@/modules/auth/pages";
import { StaffPage } from "@/modules/staff/staff-page";
import { PORTAL_NAV, STAFF_NAV } from "./navigation";

function RootRedirect() {
  const { user, isLoading } = useSession();
  if (isLoading) return <FullPageSpinner />;
  return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />;
}

/** Signed-in users skip the auth screens. */
function GuestOnly({ children }: { children: React.ReactNode }) {
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
      action={
        <Link to="/" className="text-[13px] font-medium text-primary hover:underline">
          Go home
        </Link>
      }
    />
  );
}

const staffPlaceholders = STAFF_NAV.flatMap((g) => g.items)
  .map((i) => i.to)
  .filter((to) => to !== "/settings/staff");

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
      {
        path: "/settings/staff",
        element: (
          <RequirePermission permission="staff:manage">
            <StaffPage />
          </RequirePermission>
        ),
      },
      // Module routes not built yet. Owners: replace with real routes (list, detail, new).
      ...staffPlaceholders.map((path) => ({ path: `${path}/*`, element: <ModulePlaceholder /> })),
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
      { index: true, element: <ModulePlaceholder /> },
      { path: "*", element: <ModulePlaceholder /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
