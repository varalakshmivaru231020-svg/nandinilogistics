import { z } from "zod";

/**
 * What a lead must look like to be captured — shared by the New Lead form's
 * action and the lead import, so a lead imported from a sheet passes exactly
 * the checks one typed in by hand does.
 *
 * Pure, and outside the "use server" actions file, which may only export
 * async functions.
 */
export const LeadSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().min(8, "A valid phone number is required"),
  altPhone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  sourceId: z.string().min(1, "Lead source is required"),
  projectId: z.string().optional(),
  requirement: z.string().trim().optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
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
