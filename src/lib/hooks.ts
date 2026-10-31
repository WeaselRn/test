/**
 * Small mutation helpers so every module handles success/error toasts and cache
 * invalidation the same way. Owner: Person 1.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui";

export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: string[][]; onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      opts.onSuccess?.(r);
    },
    onError: (err) => toast.error(err.message),
  });
}

/** Download a CSV/text endpoint through the browser. */
export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
