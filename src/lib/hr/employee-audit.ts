import { maskId } from "@/lib/hr/list-filters";

/** The fields the rider form edits — what an edit's audit diff compares. */
export type EditableEmployee = {
  name: string;
  mobile: string;
  aadhaar: string | null;
  pan: string | null;
  address: string | null;
  altContact: string | null;
  employmentTypeId: string;
  designationId: string | null;
  emergencyMobileFamily?: string | null;
  emergencyMobileFriend?: string | null;
  bankAccountNo?: string | null;
  bankHolderName?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  pfNumber?: string | null;
  drivingLicence?: string | null;
  insuranceNumber?: string | null;
  monthlySalary?: number | null;
  joinedOn?: string | null;
  companyIds?: string[];
};

/** Identity and bank numbers: recorded in the audit masked to their last four characters. */
const IDENTITY_FIELDS = ["aadhaar", "pan", "bankAccountNo", "drivingLicence"] as const;

export function editableEmployee(e: EditableEmployee): EditableEmployee {
  return {
    name: e.name,
    mobile: e.mobile,
    aadhaar: e.aadhaar,
    pan: e.pan,
    address: e.address,
    altContact: e.altContact,
    employmentTypeId: e.employmentTypeId,
    designationId: e.designationId,
    emergencyMobileFamily: e.emergencyMobileFamily ?? null,
    emergencyMobileFriend: e.emergencyMobileFriend ?? null,
    bankAccountNo: e.bankAccountNo ?? null,
    bankHolderName: e.bankHolderName ?? null,
    bankIfsc: e.bankIfsc ?? null,
    bankName: e.bankName ?? null,
    pfNumber: e.pfNumber ?? null,
    drivingLicence: e.drivingLicence ?? null,
    insuranceNumber: e.insuranceNumber ?? null,
    monthlySalary: e.monthlySalary ?? null,
    joinedOn: e.joinedOn ?? null,
    companyIds: [...(e.companyIds ?? [])].sort(),
  };
}

/**
 * Masks identity numbers in a field-level diff. The diff is taken on the real
 * values first, so a changed number is still recorded as changed even when its
 * last four characters happen to match.
 */
export function maskIdentityChanges(
  changes: Record<string, { from: unknown; to: unknown }> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!changes) return null;
  const out = { ...changes };
  for (const key of IDENTITY_FIELDS) {
    const c = out[key];
    if (!c) continue;
    out[key] = {
      from: maskId(typeof c.from === "string" ? c.from : null),
      to: maskId(typeof c.to === "string" ? c.to : null),
    };
  }
  return out;
}
