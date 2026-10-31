import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center text-muted">
      <Spinner className="size-5" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-subtle", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-lg border border-line bg-surface text-muted shadow-card [&_svg]:size-5">
        {icon ?? <Inbox />}
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-lg bg-danger-soft text-danger [&_svg]:size-5">
        <AlertTriangle />
      </div>
      <p className="font-medium text-ink">Could not load this data</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{message ?? "Check your connection and try again."}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-[13px] font-medium text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "pending"; children: ReactNode }) {
  const tones = {
    danger: "bg-danger-soft text-danger border-danger/15",
    success: "bg-success-soft text-success border-success/15",
    pending: "bg-pending-soft text-pending border-pending/15",
  };
  return <div className={cn("rounded-md border px-3 py-2 text-[13px]", tones[tone])}>{children}</div>;
}
