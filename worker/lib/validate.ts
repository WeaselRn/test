import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { ApiError, zodFields } from "./errors";

/**
 * Request validation with the shared zod schemas. Failures become
 * `{ error: { code: "validation_failed", fields } }` so the UI can show inline errors.
 */
export function validate<T extends ZodType, Target extends "json" | "query" | "param">(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ApiError("validation_failed", "Check the highlighted fields.", zodFields(result.error));
    }
  });
}
