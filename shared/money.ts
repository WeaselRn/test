/**
 * Money helpers. Authoritative amounts are integers in minor units (paise/cents).
 * The API exchanges money as strings with exactly 2 decimals ("2560.00").
 * Percentages are integers in basis points (18% = 1800).
 */

export type Minor = number;

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

/** "2560.5" -> 256050. Throws on invalid input; validate with zod first. */
export function toMinor(value: string | number): Minor {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!MONEY_RE.test(s)) throw new Error(`Invalid money value: ${value}`);
  const negative = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -minor : minor;
}

/** 256050 -> "2560.50" */
export function fromMinor(minor: Minor): string {
  assertInt(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/** "18" | "18.5" -> 1800 | 1850 basis points. */
export function toBasisPoints(value: string | number): number {
  return toMinor(value);
}

export function fromBasisPoints(bp: number): string {
  return fromMinor(bp);
}

/** Round half away from zero to an integer number of minor units. */
export function roundMinor(value: number): Minor {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** amount × basisPoints / 10000, rounded to minor units. */
export function applyBasisPoints(amount: Minor, bp: number): Minor {
  return roundMinor((amount * bp) / 10_000);
}

export function sumMinor(values: readonly Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}

export function formatMoney(minor: Minor, currency = "INR", locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(minor / 100);
}

function assertInt(n: number) {
  if (!Number.isSafeInteger(n)) throw new Error(`Money must be an integer of minor units, got ${n}`);
}
