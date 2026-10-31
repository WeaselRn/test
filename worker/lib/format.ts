import { formatMoney, type Minor } from "../../shared/money";

/** Money for emails and activity summaries, e.g. "₹2,560.00". */
export function money(minor: Minor): string {
  return formatMoney(minor, "INR");
}
