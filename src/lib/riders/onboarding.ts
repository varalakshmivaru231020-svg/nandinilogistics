/**
 * Rider onboarding — SOW §3.2 — the rules, kept pure.
 *
 * A rider is an Employee whose employment type is "Rider". Draft → Submitted →
 * Accepted / Rejected; a rejected form may be corrected and resubmitted. What
 * must be on the form before it can be submitted is decided here, in one
 * place, so the submit action, the detail screen and the mobile record all
 * name the same gaps.
 */

export type OnboardingStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "REJECTED";

export const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ["DRAFT", "SUBMITTED", "ACCEPTED", "REJECTED"];

export const ONBOARDING_LABEL: Record<OnboardingStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

export const ONBOARDING_TONE: Record<OnboardingStatus, "draft" | "warn" | "good" | "bad"> = {
  DRAFT: "draft",
  SUBMITTED: "warn",
  ACCEPTED: "good",
  REJECTED: "bad",
};

export function isOnboardingStatus(value: string): value is OnboardingStatus {
  return (ONBOARDING_STATUSES as readonly string[]).includes(value);
}

/** The employment type the SOW's rider rules apply to, whatever its case. */
export function isRiderType(employmentTypeName: string | null | undefined): boolean {
  return (employmentTypeName ?? "").trim().toLowerCase() === "rider";
}

export function isInternalStaffType(employmentTypeName: string | null | undefined): boolean {
  return (employmentTypeName ?? "").trim().toLowerCase() === "internal staff";
}

/** The KYC document slots the onboarding form offers, by `EmployeeDocument.kind`. */
export const RIDER_DOC_KINDS = [
  "Aadhaar front",
  "Aadhaar back",
  "PAN card",
  "Passbook",
  "Driving licence",
] as const;
export type RiderDocKind = (typeof RIDER_DOC_KINDS)[number];

/** The copies a rider cannot be submitted without — SOW §3.2 row 7. */
export const MANDATORY_RIDER_DOCS: readonly RiderDocKind[] = ["Aadhaar front", "Aadhaar back"];

export const AADHAAR_RE = /^\d{12}$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Aadhaar as typed — "1234 5678 9012" — reduced to its digits. */
export function aadhaarDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface OnboardingSubject {
  name: string;
  mobile: string;
  aadhaar: string;
  pan: string | null;
  emergencyMobileFamily: string | null;
  emergencyMobileFriend: string | null;
  bankAccountNo: string | null;
  bankHolderName: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  photoKey: string | null;
  /** The companies the rider is deployed to, by id. */
  companyIds: string[];
  /** Whether the rider rules apply — an internal staff record needs less. */
  isRider: boolean;
}

/**
 * What is still missing before the form can be submitted, in the words the
 * screen shows. Empty when it is complete.
 */
export function onboardingChecklist(
  subject: OnboardingSubject,
  documentKinds: readonly string[],
): string[] {
  const missing: string[] = [];
  const has = (v: string | null | undefined) => Boolean(v && v.trim());

  if (!has(subject.name)) missing.push("Full name");
  if (!has(subject.mobile)) missing.push("Mobile number");
  if (!AADHAAR_RE.test(aadhaarDigits(subject.aadhaar))) missing.push("A 12-digit Aadhaar number");
  if (subject.pan && !PAN_RE.test(subject.pan.trim().toUpperCase())) missing.push("A valid PAN (ABCDE1234F)");
  if (!subject.photoKey) missing.push("Photo");

  if (subject.isRider) {
    if (!has(subject.emergencyMobileFamily)) missing.push("Emergency mobile — father / mother");
    if (!has(subject.emergencyMobileFriend)) missing.push("Emergency mobile — friend");
    if (!has(subject.bankAccountNo)) missing.push("Bank account number");
    if (!has(subject.bankHolderName)) missing.push("Account holder name");
    if (!has(subject.bankIfsc)) missing.push("IFSC code");
    else if (!IFSC_RE.test(subject.bankIfsc!.trim().toUpperCase())) missing.push("A valid IFSC code");
    if (!has(subject.bankName)) missing.push("Bank name");
    if (subject.companyIds.length === 0) missing.push("At least one company");
    for (const kind of MANDATORY_RIDER_DOCS) {
      if (!documentKinds.includes(kind)) missing.push(`${kind} photo`);
    }
  }
  return missing;
}

/** Whether a form in `status` may move to `next`, and why not. */
export function onboardingTransition(
  status: OnboardingStatus,
  next: "SUBMITTED" | "ACCEPTED" | "REJECTED",
): { ok: true } | { ok: false; error: string } {
  switch (next) {
    case "SUBMITTED":
      if (status === "DRAFT" || status === "REJECTED") return { ok: true };
      return { ok: false, error: status === "SUBMITTED" ? "This form is already waiting for review." : "An accepted rider cannot be resubmitted." };
    case "ACCEPTED":
    case "REJECTED":
      if (status === "SUBMITTED") return { ok: true };
      return {
        ok: false,
        error: status === "ACCEPTED"
          ? "This rider has already been accepted."
          : "The form has to be submitted before it can be reviewed.",
      };
  }
}
