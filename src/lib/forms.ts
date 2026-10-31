/**
 * Forms use react-hook-form with the shared zod schemas, so browser and server apply
 * identical rules. Errors show when a field loses focus; submit is blocked until valid.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues, type Path, type UseFormProps, type UseFormReturn } from "react-hook-form";
import type { z, ZodType } from "zod";
import { ApiRequestError } from "./api";

export function useZodForm<S extends ZodType<FieldValues, FieldValues>>(
  schema: S,
  props?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver">,
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({ mode: "onTouched", resolver: zodResolver(schema as never) as never, ...props });
}

/** Copy `{ fields }` from an API error onto the form. Returns the general message. */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, any>, err: unknown): string {
  if (err instanceof ApiRequestError) {
    for (const [field, message] of Object.entries(err.fields)) {
      form.setError(field as Path<T>, { type: "server", message });
    }
    return err.message;
  }
  return "Something went wrong. Try again.";
}
