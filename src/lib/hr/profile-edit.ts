/**
 * A rider's request to change their own particulars — SOW §3.6. Pure: which
 * fields may be asked for, and what a request actually changes.
 */
import { IFSC_RE } from "@/lib/riders/onboarding";

export const PROFILE_EDIT_KEYS = [
  "mobile", "altContact", "address", "emergencyMobileFamily", "emergencyMobileFriend",
  "bankAccountNo", "bankHolderName", "bankIfsc", "bankName", "insuranceNumber",
] as const;
export type ProfileEditKey = (typeof PROFILE_EDIT_KEYS)[number];

export const PROFILE_EDIT_LABEL: Record<ProfileEditKey, string> = {
  mobile: "Mobile number",
  altContact: "Alternate number",
  address: "Address",
  emergencyMobileFamily: "Father / mother mobile",
  emergencyMobileFriend: "Friend mobile",
  bankAccountNo: "Account number",
  bankHolderName: "Account holder name",
  bankIfsc: "IFSC code",
  bankName: "Bank name",
  insuranceNumber: "Insurance number",
};

const PHONES: ReadonlySet<ProfileEditKey> = new Set<ProfileEditKey>([
  "mobile", "altContact", "emergencyMobileFamily", "emergencyMobileFriend",
]);

/**
 * The fields a request changes: only the editable keys, only where the value
 * differs from the record. A value left blank means "leave it", never "clear it".
 */
export function profileEditChanges(
  posted: Record<string, unknown>,
  current: Partial<Record<ProfileEditKey, string | null>>,
): { ok: true; changes: Partial<Record<ProfileEditKey, string>> } | { ok: false; error: string } {
  const changes: Partial<Record<ProfileEditKey, string>> = {};
  for (const key of PROFILE_EDIT_KEYS) {
    let v = String(posted[key] ?? "").trim();
    if (!v) continue;
    if (key === "bankIfsc") v = v.toUpperCase();
    if (PHONES.has(key) && v.replace(/\D/g, "").length < 10) {
      return { ok: false, error: `${PROFILE_EDIT_LABEL[key]} must be a valid number.` };
    }
    if (key === "bankIfsc" && !IFSC_RE.test(v)) return { ok: false, error: "IFSC should look like HDFC0001234" };
    if (v !== (current[key] ?? "")) changes[key] = v;
  }
  if (Object.keys(changes).length === 0) return { ok: false, error: "Change at least one field." };
  return { ok: true, changes };
}

/** Reads a stored request's changes back, dropping anything not editable. */
export function storedChanges(raw: unknown): Partial<Record<ProfileEditKey, string>> {
  const out: Partial<Record<ProfileEditKey, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of PROFILE_EDIT_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}
