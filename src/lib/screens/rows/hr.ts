import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { ONBOARDING_LABEL, ONBOARDING_TONE, type OnboardingStatus } from "@/lib/riders/onboarding";
import type { ReferralStatus } from "@/lib/riders/referrals";

export { ATTENDANCE_EMPTY, EMPLOYEE_EMPTY } from "@/lib/hr/list-display";

/**
 * The rows of the Riders & Staff module, as the web draws them: a person on
 * the Riders & Staff tab, an onboarding form in the queue, a referral in the
 * history, and an attendance total on the report.
 */

export interface EmployeeRowInput {
  id: string;
  name: string;
  code: string;
  mobile: string;
  altContact: string | null;
  designation: string | null;
  employmentType: string;
  aadhaar: string | null;
  pan: string | null;
  address: string | null;
  status: string;
  onboardingStatus: OnboardingStatus;
  companies: string[];
}

export function employeeScreenRow(
  e: EmployeeRowInput,
  /** The employee's own decisions — the web row shows them in short words. */
  actions: RecordAction[] = [],
): ScreenRow {
  const inactive = e.status !== "ACTIVE";
  return {
    id: e.id,
    title: e.name,
    chips: [
      { text: e.employmentType, tone: "draft" },
      { text: ONBOARDING_LABEL[e.onboardingStatus], tone: ONBOARDING_TONE[e.onboardingStatus] },
      ...(inactive ? [{ text: "Left", tone: "draft" as const }] : []),
    ],
    meta: `📞 ${e.mobile} · ${e.code}`,
    lines: [
      { value: `${e.designation ?? "—"} · alt ${e.altContact ?? "—"}` },
      { label: "Companies", value: e.companies.join(", ") || "—" },
      { label: "Aadhaar · PAN", value: `${e.aadhaar ?? "—"} · ${e.pan ?? "—"}` },
      { label: "Address", value: e.address ?? "—" },
    ],
    /*
     * The web row offers Activate only on somebody who is inactive — an active
     * employee gets View instead — then Edit and Delete.
     */
    actions: asRowActions(actions, {
      ...(inactive ? { status: "Activate" } : {}),
      edit: "Edit",
      delete: "Delete",
    }),
  };
}

/* ---------------------------------------------------------- onboarding */

export interface OnboardingRowInput {
  id: string;
  name: string;
  code: string;
  mobile: string;
  employmentType: string;
  companies: string[];
  onboardingStatus: OnboardingStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  leadNo: string | null;
}

export function onboardingScreenRow(r: OnboardingRowInput, actions: RecordAction[] = []): ScreenRow {
  return {
    id: r.id,
    title: r.name,
    meta: `${r.code} · 📞 ${r.mobile}`,
    chips: [{ text: r.employmentType, tone: "draft" }],
    lines: [
      { label: "Companies", value: r.companies.join(", ") || "—" },
      { label: "Submitted", value: r.submittedAt ?? "—" },
      { label: "Decided", value: r.decidedAt ? `${r.decidedAt}${r.decidedBy ? ` · ${r.decidedBy}` : ""}` : "—" },
      ...(r.leadNo ? [{ label: "From lead", value: r.leadNo }] : []),
    ],
    status: { label: ONBOARDING_LABEL[r.onboardingStatus], tone: ONBOARDING_TONE[r.onboardingStatus] },
    actions: asRowActions(actions, { submit: "Submit", accept: "Accept", reject: "Reject" }),
  };
}

/* ------------------------------------------------------------ referrals */

export interface ReferralRowInput {
  id: string;
  referrer: string;
  referrerCode: string;
  referred: string;
  referredCode: string;
  referredOn: string;
  joinedOn: string | null;
  status: ReferralStatus;
}

export function referralScreenRow(r: ReferralRowInput): ScreenRow {
  const tone = r.status.state === "VALID" ? "good" : r.status.state === "PENDING" ? "warn" : r.status.state === "LEFT" ? "bad" : "draft";
  return {
    id: r.id,
    title: r.referred,
    meta: `${r.referredCode} · referred by ${r.referrer} (${r.referrerCode})`,
    lines: [
      { label: "Referred on", value: r.referredOn },
      { label: "Joined", value: r.joinedOn ?? "—" },
      { label: "Eligible", value: r.status.eligible ? "Yes" : "No" },
    ],
    status: { label: r.status.label, tone },
  };
}

/* ----------------------------------------------------------- attendance */

export interface AttendanceRowInput {
  id: string;
  name: string;
  code: string;
  employmentType: string;
  status: string;
  present: number;
  half: number;
  absent: number;
  payable: number;
  overtime: number;
}

export function attendanceScreenRow(r: AttendanceRowInput): ScreenRow {
  const inactive = r.status !== "ACTIVE";
  return {
    id: r.id,
    title: r.name,
    meta: r.code,
    chips: [
      { text: r.employmentType, tone: "draft" },
      ...(inactive ? [{ text: "Left", tone: "draft" as const }] : []),
    ],
    lines: [
      { label: "Present", value: String(r.present) },
      { label: "Half day", value: String(r.half) },
      { label: "Absent", value: String(r.absent) },
      { label: "Overtime (hrs)", value: String(r.overtime) },
    ],
    trailing: { value: String(r.payable), label: "Payable days" },
  };
}
