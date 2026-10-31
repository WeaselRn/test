import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: number;
  tone: "success" | "error";
  message: string;
}

const ToastContext = createContext<((tone: ToastItem["tone"], message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastItem["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="no-print fixed right-4 bottom-4 z-50 flex w-[calc(100%-32px)] max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn("flex animate-slide-up items-start gap-2.5 rounded-lg bg-ink px-4 py-3 text-[13px] text-white shadow-pop")}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="mt-px size-4 shrink-0 text-red-400" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (message: string) => push("success", message),
    error: (message: string) => push("error", message),
  };
}
