import { z } from "zod";
import { isISODate } from "../dates";

export const idSchema = z.string().min(1).max(64);

/** Money as a string with up to 2 decimals, 0 or more. Convert with toMinor() on the server. */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals");

export const positiveMoneySchema = moneySchema.refine((v) => Number(v) > 0, "Amount must be above 0");

/** Percentage 0-100 with up to 2 decimals. */
export const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage")
  .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Must be between 0 and 100");

export const isoDateSchema = z.string().refine(isISODate, "Enter a valid date (YYYY-MM-DD)");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/** PRD: more than 8 characters, one uppercase, one lowercase, one special character. */
export const PASSWORD_RULES = [
  { id: "length", label: "More than 8 characters", test: (v: string) => v.length > 8 },
  { id: "upper", label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "special", label: "One special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export const passwordSchema = z
  .string()
  .max(128, "Password is too long")
  .superRefine((v, ctx) => {
    const failed = PASSWORD_RULES.filter((r) => !r.test(v));
    if (failed.length) {
      ctx.addIssue({
        code: "custom",
        message: `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(", ")}`,
      });
    }
  });

export const nameSchema = z.string().trim().min(1, "Required").max(120);
export const notesSchema = z.string().trim().max(2000).optional().nullable();
export const quantitySchema = z.coerce.number().int("Whole number only").min(1, "At least 1");
