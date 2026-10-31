import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Headline metric tile for dashboards. */
export function Stat({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "danger" | "success";
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-[13px] text-muted [&_svg]:size-4">
        {label}
        {icon}
      </div>
      <div
        className={cn(
          "tabular mt-2 text-2xl font-semibold tracking-tight text-ink",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-[12px] text-muted">{detail}</div>}
    </Card>
  );
}
