import type { ReactNode } from "react";
import { cn, titleCase } from "@/lib/utils";

export type Tone = "draft" | "pending" | "success" | "danger" | "primary" | "accent";

const tones: Record<Tone, string> = {
  draft: "bg-draft-soft text-draft ring-draft/15",
  pending: "bg-pending-soft text-pending ring-pending/20",
  success: "bg-success-soft text-success ring-success/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  primary: "bg-primary-soft text-primary-ink ring-primary/20",
  accent: "bg-accent-soft text-accent-ink ring-accent/25",
};

const dots: Record<Tone, string> = {
  draft: "bg-draft/60",
  pending: "bg-pending",
  success: "bg-success",
  danger: "bg-danger",
  primary: "bg-primary",
  accent: "bg-accent",
};

export function Badge({ tone = "draft", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

/**
 * Status → tone mapping for every lifecycle in the app (PRD §7 design system).
 * Add new statuses here, never in a screen.
 */
const STATUS_TONE: Record<string, Tone> = {
  // subscriptions
  draft: "draft",
  quotation: "pending",
  confirmed: "primary",
  active: "success",
  paused: "pending",
  closed: "draft",
  expired: "danger",
  // invoices
  paid: "success",
  cancelled: "danger",
  overdue: "danger",
  // findings and tasks
  open: "pending",
  reviewed: "primary",
  resolved: "success",
  critical: "danger",
  high: "danger",
  medium: "pending",
  low: "draft",
  // users
  enabled: "success",
  disabled: "draft",
  simulated: "accent",
  sent: "success",
  failed: "danger",
  quoted: "primary",
  renewed: "success",
  pending: "pending",
  accepted_alternative: "success",
  healthy: "success",
  needs_attention: "pending",
  at_risk: "danger",
  completed: "success",
  running: "pending",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "draft"} dot>
      {label ?? titleCase(status)}
    </Badge>
  );
}
