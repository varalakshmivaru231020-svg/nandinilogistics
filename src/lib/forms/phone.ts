/**
 * The one rule for a mobile number, everywhere it is typed: ten digits,
 * starting 6–9, as an Indian mobile is. A dial code ("+91", "91") or a
 * leading trunk zero in front of it is tolerated, so a number pasted from a
 * contact list passes, but anything else — a landline, nine digits, eleven
 * — is refused with the same sentence on every form.
 *
 * Pure and shared by the web actions, the client inputs and the app's
 * self sign-up, so no screen can accept what another refuses.
 */

/** The ten digits that identify the number, or whatever was left after stripping. */
export function mobileDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidMobile(value: string | null | undefined): boolean {
  return /^[6-9]\d{9}$/.test(mobileDigits(value));
}

/** What to tell the person, or null when the number is fine (or blank and optional). */
export function mobileProblem(value: string | null | undefined, label: string, required = false): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? `${label} is required.` : null;
  return isValidMobile(raw) ? null : `${label} must be a 10-digit mobile number.`;
}
