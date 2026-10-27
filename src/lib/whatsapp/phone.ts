/**
 * A number as Meta takes it: digits only, country code included, no plus.
 *
 * Ported from the sales project, where it was written against real customer
 * data and handles every shape this organisation's records hold:
 *
 *   "+91 98765 43210"  → "919876543210"
 *   "9876543210"       → "919876543210"   (ten digits — India assumed)
 *   "09876543210"      → "919876543210"   (local, with the trunk zero)
 *   "0091 98765 43210" → "919876543210"
 *   "+1 415 555 0132"  → "14155550132"    (already country-coded; left alone)
 *
 * Pure, and apart from the client, because it decides something — what counts
 * as a number worth sending to — and that deserves a test rather than a guess
 * in the middle of a send.
 */

/** Digits only, country code included, or "" where there is no usable number. */
export function normalisePhone(input: string | null | undefined): string {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // The international prefix, where somebody typed 00 instead of +.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Already canonical for India.
  if (digits.length === 12 && digits.startsWith("91")) return digits;

  // Local Indian format, with the trunk zero in front.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  // Ten digits is an Indian mobile without its country code.
  if (digits.length === 10) return `91${digits}`;

  /*
   * Anything else is assumed to carry its own country code already. A number
   * too short to be one is refused below rather than sent somewhere strange.
   */
  return digits;
}

/**
 * Whether this is worth sending to at all.
 *
 * A masked number — the list screens write "98765•••••" for somebody who may
 * not see contact details — normalises to a handful of digits, and sending to
 * it would be dialling a stranger. Eight digits is below any real mobile.
 */
export function isSendable(phone: string | null | undefined): boolean {
  const digits = normalisePhone(phone);
  return digits.length >= 10 && digits.length <= 15;
}
