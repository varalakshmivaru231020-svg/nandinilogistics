/**
 * A rider has two addresses: the professional one (where they live while
 * deployed — the `temporary*` columns) and the personal one (their permanent
 * home — the `permanent*` columns). The column names predate the labels;
 * this is the one place that maps between them.
 */

export interface AddressParts {
  temporaryStreet?: string | null;
  temporaryCity?: string | null;
  temporaryState?: string | null;
  temporaryPinCode?: string | null;
  permanentStreet?: string | null;
  permanentCity?: string | null;
  permanentState?: string | null;
  permanentPinCode?: string | null;
  /** The old single free-text address, kept for records entered before the split. */
  address?: string | null;
}

export const PROFESSIONAL_ADDRESS_LABEL = "Professional address";
export const PERSONAL_ADDRESS_LABEL = "Personal address";

function join(parts: Array<string | null | undefined>): string | null {
  const out = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  return out || null;
}

/** The professional address as one line, falling back to the legacy field. */
export function professionalAddress(e: AddressParts): string | null {
  return join([e.temporaryStreet, e.temporaryCity, e.temporaryState, e.temporaryPinCode]) ?? (e.address?.trim() || null);
}

/** The personal (permanent) address as one line. */
export function personalAddress(e: AddressParts): string | null {
  return join([e.permanentStreet, e.permanentCity, e.permanentState, e.permanentPinCode]);
}
