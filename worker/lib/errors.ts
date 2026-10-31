import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { core } from "zod";
import type { ApiErrorBody, ErrorCode } from "../../shared/api";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  invalid_transition: 409,
  internal: 500,
};

/** Throw from any route or service; the global handler turns it into the shared error shape. */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }

  static notFound(what = "Resource") {
    return new ApiError("not_found", `${what} not found.`);
  }
  static forbidden(message = "You do not have access to this resource.") {
    return new ApiError("forbidden", message);
  }
  static conflict(message: string, fields?: Record<string, string>) {
    return new ApiError("conflict", message, fields);
  }
}

export function zodFields(error: { issues: readonly core.$ZodIssue[] }): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, fields: err.fields } };
    return c.json(body, STATUS[err.code]);
  }
  console.error("Unhandled error", err);
  const body: ApiErrorBody = { error: { code: "internal", message: "Something went wrong. Try again." } };
  return c.json(body, 500);
}

/** True when a D1 error is a UNIQUE constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err);
  return /UNIQUE constraint failed/i.test(msg);
}
