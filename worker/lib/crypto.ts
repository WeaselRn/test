/**
 * Password hashing and token helpers built on Web Crypto, so they run in Workers
 * and in Node (seed script) without native modules.
 *
 * PBKDF2-SHA256 is used instead of bcrypt: bcrypt in pure JS exceeds the Workers
 * free-plan CPU budget, while Web Crypto PBKDF2 runs natively. The iteration count is
 * stored in the hash, so it can be raised later without breaking existing passwords.
 * This file must not import anything: scripts/seed.ts imports it directly in Node.
 */

const ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k iterations.
const KEY_LENGTH_BITS = 256;
const PREFIX = "pbkdf2_sha256";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iter, saltB64, hashB64] = stored.split("$");
  if (prefix !== PREFIX || !iter || !saltB64 || !hashB64) return false;
  const expected = fromBase64(hashB64);
  const actual = await derive(password, fromBase64(saltB64), Number(iter));
  return constantTimeEqual(actual, expected);
}

/** URL-safe random token (default 32 bytes of entropy). */
export function randomToken(bytes = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  const s = atob(value);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
