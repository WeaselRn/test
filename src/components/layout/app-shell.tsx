/**
 * Application shell shared by the staff/admin app and the customer portal: fixed
 * sidebar (slide-out drawer below 768px), top bar with title, search and user menu.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ChevronsUpDown, LogOut, Menu, Search, X } from "lucide-react";
import { can } from "@shared/permissions";
import type { NavGroup } from "@/app/navigation";
import { useAuthActions, useSession } from "@/lib/auth";
import { cn, initials, titleCase } from "@/lib/utils";

export function AppShell({ nav, portal }: { nav: NavGroup[]; portal?: boolean }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen md:pl-60">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-zinc-400 transition-transform md:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar nav={nav} portal={portal} onClose={() => setDrawerOpen(false)} />
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-30 animate-fade-in bg-ink/40 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}
      <div className="flex min-h-screen flex-col">
        <Topbar nav={nav} portal={portal} onMenu={() => setDrawerOpen(true)} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#27272a" />
        <circle cx="16" cy="16" r="7.5" fill="none" stroke="#a5b4fc" strokeWidth="3" />
        <circle cx="21.3" cy="10.7" r="2.6" fill="#fafaf9" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-white">Brightloop</span>
    </div>
  );
}

function Sidebar({ nav, portal, onClose }: { nav: NavGroup[]; portal?: boolean; onClose: () => void }) {
  const { user } = useSession();
  const groups = nav
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.permission || can(user?.role, i.permission)) && (!i.roles || (user && i.roles.includes(user.role)))) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        <Logo />
        <button onClick={onClose} className="rounded-md p-1 hover:bg-white/10 md:hidden" aria-label="Close menu">
          <X className="size-4" />
        </button>
      </div>
      {portal && <div className="mx-4 mb-2 rounded-md bg-white/5 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Customer portal</div>}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.label}>
            {!portal && <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{g.label}</div>}
            <ul className="space-y-px">
              {g.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/portal" || item.to === "/customers"}
                    className={({ isActive }) =>
                      cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors hover:bg-white/5 hover:text-zinc-100",
                        isActive && "bg-white/10 font-medium text-white",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0 opacity-80" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <UserMenu />
    </>
  );
}

function UserMenu() {
  const { user } = useSession();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (!user) return null;

  return (
    <div ref={ref} className="relative border-t border-white/10 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-white/5"
        aria-expanded={open}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-zinc-100">{user.name}</span>
          <span className="block truncate text-[11px] text-zinc-500">{titleCase(user.role)}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-3 bottom-full left-3 mb-1 animate-slide-up rounded-lg bg-surface p-1 text-body shadow-pop">
          <div className="truncate px-2.5 py-2 text-[12px] text-muted">{user.email}</div>
          <button
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login") })}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-hover"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ nav, portal, onMenu }: { nav: NavGroup[]; portal?: boolean; onMenu: () => void }) {
  const location = useLocation();
  const current = nav
    .flatMap((g) => g.items)
    .filter((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur md:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-muted hover:bg-hover md:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="text-[13px] font-medium text-ink">{current?.label ?? (portal ? "Portal" : "Brightloop")}</div>
      {!portal && <GlobalSearch />}
    </header>
  );
}

/** Global search: routes the query to the subscriptions list (searches number or customer). */
function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  return (
    <form
      className="ml-auto hidden w-full max-w-xs sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) navigate(`/subscriptions?q=${encodeURIComponent(value.trim())}`);
      }}
    >
      <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted shadow-card focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
        <Search className="size-3.5" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search subscriptions or customers"
          className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
        />
      </label>
    </form>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="relative hidden overflow-hidden bg-sidebar p-10 text-zinc-300 lg:flex lg:flex-col">
        <Logo />
        <div className="mt-auto max-w-md">
          <p className="text-[28px] leading-tight font-semibold tracking-tight text-white">
            Recurring revenue, billed right. Every period, exactly once.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">
            Plans, quotes, subscriptions, invoices and payments in one ledger, with leakage detection that catches what
            spreadsheets miss.
          </p>
        </div>
        <LedgerArt />
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="inline-flex rounded-lg bg-sidebar p-2">
              <Logo />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Decorative invoice ledger for the auth screen. */
function LedgerArt() {
  const rows = [
    ["INV-000412", "Acme Labs", "₹48,260.00", "Paid"],
    ["INV-000413", "Northwind", "₹12,980.00", "Confirmed"],
    ["INV-000414", "Globex", "₹6,490.00", "Overdue"],
  ];
  return (
    <div className="pointer-events-none absolute top-24 right-10 w-[400px] rotate-[-3deg] rounded-xl border border-white/10 bg-white/[0.03] p-4 font-mono text-[11px] text-zinc-400 shadow-2xl">
      {rows.map(([n, c, a, s]) => (
        <div key={n} className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0">
          <span className="text-zinc-300">{n}</span>
          <span>{c}</span>
          <span className="text-zinc-200">{a}</span>
          <span className={s === "Paid" ? "text-emerald-400" : s === "Overdue" ? "text-red-400" : "text-indigo-300"}>{s}</span>
        </div>
      ))}
    </div>
  );
}
