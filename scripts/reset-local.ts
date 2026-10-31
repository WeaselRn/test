/** Deletes the local D1/Miniflare state so migrations and seeds start clean. */
import { rmSync } from "node:fs";

rmSync(".wrangler/state", { recursive: true, force: true });
console.log("Local database removed (.wrangler/state).");
