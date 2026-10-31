import { clsx, type ClassValue } from "clsx";
import { formatMoney, toMinor } from "@shared/money";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const CURRENCY = "INR";

/** Format an API money string ("2560.00") for display. */
export function money(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatMoney(toMinor(value), CURRENCY);
}

export function date(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
