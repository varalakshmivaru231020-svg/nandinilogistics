import { z } from "zod";

import { isValidMobile } from "@/lib/forms/phone";

/**
 * What a lead must look like to be captured — the SOW's New stage: name,
 * mobile number, companies and location. Shared by the capture action and
 * the edit rules, so the two cannot drift apart.
 *
 * Pure, and outside the "use server" actions file, which may only export
 * async functions.
 */
export const LeadSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().refine(isValidMobile, "Mobile number must be a 10-digit mobile number."),
  altPhone: z.string().trim().refine((v) => v === "" || isValidMobile(v), "Alternate number must be a 10-digit mobile number.").optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  location: z.string().trim().optional(),
  requirement: z.string().trim().optional(),
  nextActionAt: z.string().optional(),
});

export type LeadInput = z.infer<typeof LeadSchema>;

/**
 * A phone number reduced to the digits that identify it, for duplicate checks:
 * "+91 98450 12345", "098450 12345" and "9845012345" are the same person.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** The several values a multi-select posts, whichever way the body carries them. */
export function readIdList(formData: FormData, name: string): string[] {
  const values = formData
    .getAll(name)
    .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(values)];
}
