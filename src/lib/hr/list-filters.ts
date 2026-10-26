import type { Prisma } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { isOnboardingStatus, type OnboardingStatus } from "@/lib/riders/onboarding";

/**
 * The Riders & Staff list's search, filters and scope as functions, used by
 * the screens, the exports and the mobile records alike.
 */

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

/** Record ids are cuids; anything else in the URL is ignored. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface EmployeeListParams {
  q: string;
  /** Employment type id, or "". */
  type: string;
  /** Designation id, or "". */
  designation: string;
  /** Company id, or "". */
  company: string;
  /** "ACTIVE", "INACTIVE", or "" for everyone. */
  status: EmployeeStatusFilter;
}

export type EmployeeStatusFilter = "" | "ACTIVE" | "INACTIVE";

export function readEmployeeListParams(source: ParamSource): EmployeeListParams {
  const type = read(source, "type");
  const designation = read(source, "designation");
  const company = read(source, "company");
  const status = read(source, "status").toUpperCase();
  return {
    q: read(source, "q"),
    type: ID.test(type) ? type : "",
    designation: ID.test(designation) ? designation : "",
    company: ID.test(company) ? company : "",
    status: status === "ACTIVE" || status === "INACTIVE" ? status : "",
  };
}

export function employeeListWhere(p: EmployeeListParams): Prisma.EmployeeWhereInput {
  const q = p.q.trim();
  return {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
    ...(p.type ? { employmentTypeId: p.type } : {}),
    ...(p.designation ? { designationId: p.designation } : {}),
    ...(p.company ? { companies: { some: { companyId: p.company } } } : {}),
    // Anything that is not explicitly INACTIVE counts as active, so a legacy
    // value never hides someone from both filters at once.
    ...(p.status === "INACTIVE" ? { status: "INACTIVE" } : {}),
    ...(p.status === "ACTIVE" ? { status: { not: "INACTIVE" } } : {}),
  };
}

export function describeEmployeeFilters(
  p: EmployeeListParams,
  names: { type: string | null; designation: string | null; company?: string | null },
): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    names.type ? `Type ${names.type}` : null,
    names.designation ? `Designation ${names.designation}` : null,
    names.company ? `Company ${names.company}` : null,
    p.status === "ACTIVE" ? "Active only" : p.status === "INACTIVE" ? "Left only" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All riders and staff";
}

/** Masks all but the last four digits, as lead phone numbers are masked. */
export function maskId(value: string | null): string | null {
  if (!value) return null;
  return value.length > 4 ? `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}` : "••••";
}

/* ---------------------------------- scope --------------------------------- */

/**
 * Which riders this person may see — SOW §2 and §3.2.
 *
 * With `hr.employee.viewAll` (Admin), everyone, Left riders included. Without
 * it, a Team Leader sees the riders of the companies assigned to them and a
 * tele-caller the riders whose lead they own — and nobody who has left:
 * "inactive / Left riders are visible only to Admin." (The record carries no
 * creator of its own, so a rider typed in without a lead is Admin's to see.)
 *
 * The rule is one `where` fragment so the list, the detail page, the exports
 * and the mobile record cannot disagree about who is in view.
 */
export function employeeScope(ctx: AuthContext): Prisma.EmployeeWhereInput {
  if (ctx.has(PERM.hr.employee.viewAll)) return {};
  return {
    status: { not: "INACTIVE" },
    OR: [
      { companies: { some: { company: { teamLeaders: { some: { userId: ctx.id } } } } } },
      { lead: { ownerId: ctx.id } },
    ],
  };
}

/* ------------------------------- onboarding ------------------------------- */

export interface OnboardingListParams {
  q: string;
  /** An onboarding status, or "" for every form. The queue opens on SUBMITTED. */
  status: OnboardingStatus | "";
  company: string;
}

export function readOnboardingParams(source: ParamSource): OnboardingListParams {
  const status = read(source, "status").toUpperCase();
  const company = read(source, "company");
  return {
    q: read(source, "q"),
    status: status === "ALL" ? "" : isOnboardingStatus(status) ? status : status === "" ? "SUBMITTED" : "",
    company: ID.test(company) ? company : "",
  };
}

export function onboardingWhere(p: OnboardingListParams): Prisma.EmployeeWhereInput {
  const q = p.q.trim();
  return {
    ...(p.status ? { onboardingStatus: p.status } : {}),
    ...(p.company ? { companies: { some: { companyId: p.company } } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
  };
}

export function describeOnboardingFilters(p: OnboardingListParams, companyName: string | null): string {
  const parts = [
    p.status ? `${p.status.charAt(0)}${p.status.slice(1).toLowerCase()} forms` : "Every form",
    companyName ? `Company ${companyName}` : null,
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/* -------------------------------- referrals ------------------------------- */

export type ReferralFilter = "" | "PENDING" | "VALID" | "EXPIRED" | "LEFT";

export interface ReferralListParams {
  q: string;
  status: ReferralFilter;
}

export function readReferralParams(source: ParamSource): ReferralListParams {
  const status = read(source, "status").toUpperCase();
  return {
    q: read(source, "q"),
    status: ["PENDING", "VALID", "EXPIRED", "LEFT"].includes(status) ? (status as ReferralFilter) : "",
  };
}

/** Every rider somebody referred; the status is computed per row, not stored. */
export function referralWhere(p: ReferralListParams): Prisma.EmployeeWhereInput {
  const q = p.q.trim();
  return {
    referredById: { not: null },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { referredBy: { name: { contains: q, mode: "insensitive" } } },
            { referredBy: { employeeCode: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export function describeReferralFilters(p: ReferralListParams): string {
  const parts = [
    p.status ? `${p.status.charAt(0)}${p.status.slice(1).toLowerCase()} referrals` : "Every referral",
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
