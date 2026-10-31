/**
 * Calendar-date helpers. All business dates are ISO `YYYY-MM-DD` strings in UTC.
 */

export type ISODate = string;
export type BillingPeriod = "daily" | "weekly" | "monthly" | "yearly";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = parse(value);
  return toISODate(d) === value;
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Add months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = parse(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISODate(target);
}

/**
 * Start date of billing period `n` (0-based) for a subscription anchored at `anchor`.
 * Always computed from the anchor, so month-end dates never drift (31 Jan → 28 Feb → 31 Mar).
 */
export function periodStart(anchor: ISODate, period: BillingPeriod, n: number): ISODate {
  switch (period) {
    case "daily":
      return addDays(anchor, n);
    case "weekly":
      return addDays(anchor, 7 * n);
    case "monthly":
      return addMonths(anchor, n);
    case "yearly":
      return addMonths(anchor, 12 * n);
  }
}

/** Inclusive end date of billing period `n`. */
export function periodEnd(anchor: ISODate, period: BillingPeriod, n: number): ISODate {
  return addDays(periodStart(anchor, period, n + 1), -1);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when `date` is within [from, to]; a null bound is open. */
export function isWithin(date: ISODate, from: ISODate | null | undefined, to: ISODate | null | undefined): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function parse(date: ISODate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
