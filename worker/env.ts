import type { SessionUser } from "../shared/types";
import type { Database } from "./lib/db";

/** Hono environment shared by every route module. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    /** Set by `loadSession`; null when the request is anonymous. */
    user: SessionUser | null;
    sessionId: string | null;
  };
}
