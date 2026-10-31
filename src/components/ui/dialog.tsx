import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Modal dialog on the native <dialog> element (focus trap, Esc and backdrop for free). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-32px)] max-w-lg rounded-lg bg-surface p-0 text-body shadow-pop backdrop:bg-ink/30 backdrop:backdrop-blur-[1px]",
        "open:animate-slide-up",
        className,
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="-m-1 rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          {children && <div className="px-5 pt-4">{children}</div>}
          <div className="mt-5 flex justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">{footer}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
