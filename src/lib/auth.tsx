/**
 * Session state for the web app. The server is the authority on access; the UI uses
 * the role only to decide what to show (shared/permissions.ts).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { can, type Permission, type Role } from "@shared/permissions";
import type { LoginInput, SignupInput } from "@shared/schemas";
import type { SessionUser } from "@shared/types";
import { api, ApiRequestError } from "./api";
import { FullPageSpinner } from "@/components/ui/feedback";

const SESSION_KEY = ["session"] as const;

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return (await api.get<{ user: SessionUser }>("/auth/me")).user;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
  return { user: query.data ?? null, isLoading: query.isLoading };
}

export function useCan(permission: Permission): boolean {
  return can(useSession().user?.role, permission);
}

export function useAuthActions() {
  const qc = useQueryClient();
  const setUser = (user: SessionUser | null) => {
    qc.clear();
    qc.setQueryData(SESSION_KEY, user);
  };
  return {
    login: useMutation({
      mutationFn: (input: LoginInput) => api.post<{ user: SessionUser }>("/auth/login", input),
      onSuccess: (r) => setUser(r.user),
    }),
    signup: useMutation({
      mutationFn: (input: SignupInput) => api.post<{ user: SessionUser }>("/auth/signup", input),
      onSuccess: (r) => setUser(r.user),
    }),
    logout: useMutation({
      mutationFn: () => api.post<void>("/auth/logout"),
      onSettled: () => setUser(null),
    }),
  };
}

export function homePathFor(role: Role): string {
  return role === "customer" ? "/portal" : "/dashboard";
}

/** Route guard: redirects anonymous users to login and wrong roles to their home. */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

/** Route guard for pages that need one permission (e.g. Staff settings). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useSession();
  if (!can(user?.role, permission)) return <Navigate to={user ? homePathFor(user.role) : "/login"} replace />;
  return <>{children}</>;
}
