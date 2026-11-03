import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { maskId } from "@/lib/hr/list-filters";
import { professionalAddress } from "@/lib/hr/address";
import type { OnboardingStatus } from "@/lib/riders/onboarding";
import type { Employee, Referrer } from "./employee-form";

/** What the employee form and the Riders list both read off a record. */
export const EMPLOYEE_FORM_INCLUDE = {
  employmentType: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  documents: { select: { id: true, kind: true, fileName: true, fileSize: true } },
  companies: { select: { company: { select: { id: true, name: true } } } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_FORM_INCLUDE }>;

/** Internal Staff and Team Leader are the staff types; everything else is a rider type. */
export function isStaffType(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "internal staff" || n === "team leader";
}

/** The record as the form and the list show it; identity numbers masked for whoever may not see them. */
export function employeeFormRow(e: EmployeeRow, canIdentity: boolean): Employee {
  return {
    id: e.id,
    code: e.employeeCode,
    name: e.name,
    mobile: e.mobile,
    altContact: e.altContact,
    aadhaar: canIdentity ? e.aadhaar : maskId(e.aadhaar),
    pan: canIdentity ? e.pan : maskId(e.pan),
    address: professionalAddress(e),
    temporaryStreet: e.temporaryStreet,
    temporaryCity: e.temporaryCity,
    temporaryState: e.temporaryState,
    temporaryPinCode: e.temporaryPinCode,
    permanentStreet: e.permanentStreet,
    permanentCity: e.permanentCity,
    permanentState: e.permanentState,
    permanentPinCode: e.permanentPinCode,
    employmentTypeId: e.employmentType.id,
    employmentType: e.employmentType.name,
    designationId: e.designation?.id ?? null,
    designation: e.designation?.name ?? null,
    status: e.status,
    onboardingStatus: e.onboardingStatus as OnboardingStatus,
    approval: e.approval,
    emergencyMobileFamily: e.emergencyMobileFamily,
    emergencyMobileFriend: e.emergencyMobileFriend,
    bankAccountNo: canIdentity ? e.bankAccountNo : maskId(e.bankAccountNo),
    bankHolderName: e.bankHolderName,
    bankIfsc: e.bankIfsc,
    bankName: e.bankName,
    pfNumber: e.pfNumber,
    drivingLicence: canIdentity ? e.drivingLicence : maskId(e.drivingLicence),
    insuranceNumber: e.insuranceNumber,
    monthlySalary: e.monthlySalary === null ? null : Number(e.monthlySalary),
    joinedOn: e.joinedOn ? e.joinedOn.toISOString().slice(0, 10) : null,
    companyIds: e.companies.map((c) => c.company.id),
    companies: e.companies.map((c) => c.company.name),
    hasPhoto: e.photoKey !== null,
    referredById: e.referredById,
    referralApproval: e.referralApproval,
    documents: e.documents,
  };
}

/** Who may be picked as "Referred by": active, accepted riders. */
export async function loadReferrers(): Promise<Referrer[]> {
  const rows = await prisma.employee.findMany({
    where: {
      onboardingStatus: "ACCEPTED",
      status: { not: "INACTIVE" },
      employmentType: { name: { equals: "Rider", mode: "insensitive" } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true, referralCode: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, code: r.employeeCode, referralCode: r.referralCode }));
}

/**
 * The lists the form offers. The Riders page offers the rider types and the
 * Internal Staff page the staff ones; someone without the staff permission
 * is offered no staff type except the one a record already has.
 */
export async function employeeFormLists({
  group, canCreateStaff, currentTypeId,
}: {
  group: "riders" | "staff";
  canCreateStaff: boolean;
  currentTypeId?: string;
}) {
  const [types, designations, companies, referrers] = await Promise.all([
    prisma.employmentType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadReferrers(),
  ]);
  const pageTypes = types.filter((t) => (group === "staff" ? isStaffType(t.name) : !isStaffType(t.name)));
  const allowed = canCreateStaff ? pageTypes : pageTypes.filter((t) => !isStaffType(t.name) || t.id === currentTypeId);
  return { employmentTypes: allowed.length ? allowed : types, designations, companies, referrers };
}
