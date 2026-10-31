import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "./errors";

/**
 * Fixed-window rate limit stored in D1 (one row per key). Used on login and
 * password-reset endpoints only, to stay well inside the free-plan write quota.
 */
export function rateLimit(opts: { name: string; limit: number; windowSeconds: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const windowStart = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${opts.name}:${ip}`;
    const row = await c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
      .bind(key, windowStart)
      .first<{ count: number }>();
    if (row && row.count > opts.limit) {
      throw new ApiError("rate_limited", "Too many attempts. Wait a few minutes and try again.");
    }
    await next();
  };
}
