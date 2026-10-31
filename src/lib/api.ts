/**
 * The only HTTP client the web app uses. Every screen reads and writes through the
 * REST API (PRD §6). Errors are thrown as ApiRequestError with field messages, so
 * forms can show them inline.
 */
import { API_BASE, type ApiErrorBody, type ErrorCode, type Paginated } from "@shared/api";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function toQueryString(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${toQueryString(query)}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? "internal", err?.message ?? "Request failed.", err?.fields ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  list: <T>(path: string, query?: Query) => request<Paginated<T>>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
