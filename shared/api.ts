/**
 * API conventions shared by the worker and the web app (PRD §6).
 * - Base path /api/v1.
 * - Lists: ?page&pageSize(default 25, max 100)&sort&q&filters -> { data, page, pageSize, total }.
 * - Errors: { error: { code, message, fields? } }.
 * - Money: strings with 2 decimals. Dates: ISO 8601.
 */
import { z } from "zod";

export const API_BASE = "/api/v1";
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z_]+$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "invalid_transition"
  | "internal";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}
