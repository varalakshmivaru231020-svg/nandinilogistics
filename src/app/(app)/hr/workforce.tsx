import Link from "next/link";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeGroupWhere, employeeListWhere, employeeScope, maskId, readEmployeeListParams } from "@/lib/hr/list-filters";
import { parseAttendanceRange } from "@/lib/hr/attendance-report";
import { loadAttendanceReport } from "@/lib/hr/attendance-report-data";
import { ModuleStats } from "@/components/list/module-stats";
import { employeeFigures } from "@/lib/metrics/figures";
import type { OnboardingStatus } from "@/lib/riders/onboarding";
import { isRiderType } from "@/lib/riders/onboarding";
import { istClock, mapsHref } from "@/lib/hr/punch";
import { HrScreen } from "./hr-screen";

export type WorkforceView = "riders" | "staff" | "attendance";

export type WorkforceSearch = Promise<{
  tab?: string; date?: string; from?: string; to?: string;
  q?: string; type?: string; designation?: string; company?: string; status?: string;
}>;

/**
 * The three sidebar entries — Riders, Internal Staff, Attendance — are one
 * screen with a fixed view: the people list narrowed to a group of employment
 * types, or the mark and report tabs for everyone. The page files only pick
 * the view, so the three cannot drift apart.
 */
export async function Workforce({ searchParams, view }: { searchParams: WorkforceSearch; view: WorkforceView }) {
  const ctx = await requirePermission(PERM.hr.employee.view);
  const today = new Date().toISOString().slice(0, 10);
  const raw = await searchParams;
  const tabs = view === "attendance" ? ["mark", "report"] : ["staff"];
  const date = raw.date ?? today;
  const tab = raw.tab && tabs.includes(raw.tab) ? raw.tab : tabs[0];
  const range = parseAttendanceRange({ from: raw.from, to: raw.to }, today);
  // The group is the page's, never the URL's.
  const listParams = { ...readEmployeeListParams(raw), group: view === "attendance" ? ("" as const) : view };
  // Mark Attendance and the report narrow by search, type and designation only.
  const peopleParams = { ...listParams, status: "" as const };

  // Who this person may see at all — everyone for Admin, the team otherwise.
  const scope = employeeScope(ctx);

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const canViewAttendance = ctx.has(PERM.hr.attendance.view);
  const canReport = ctx.has(PERM.hr.attendance.tabReport);

  const listing = view !== "attendance";
  const [employees, employmentTypes, designations, companies] = await Promise.all([
    !listing ? [] : prisma.employee.findMany({
      // Search, employment type, designation and status — the same function the export uses.
      where: { AND: [scope, employeeListWhere(listParams)] },
      orderBy: { name: "asc" },
      include: {
        employmentType: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        documents: { select: { id: true, kind: true, fileName: true, fileSize: true } },
        companies: { select: { company: { select: { id: true, name: true } } } },
      },
    }),
    prisma.employmentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { employees: true } } },
    }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // The day being marked: active, accepted people only, and only their marks.
  const markDate = new Date(`${date}T00:00:00.000Z`);
  const [markable, dayEntries] = canViewAttendance && !listing
    ? await Promise.all([
        prisma.employee.findMany({
          where: { AND: [scope, employeeListWhere({ ...peopleParams, status: "ACTIVE" }), { onboardingStatus: "ACCEPTED" }] },
          orderBy: { name: "asc" },
          select: {
            id: true, employeeCode: true, name: true,
            employmentType: { select: { name: true } },
            designation: { select: { name: true } },
          },
        }),
        Number.isNaN(markDate.getTime())
          ? []
          : prisma.attendanceEntry.findMany({
              where: { attendanceOn: markDate, employee: { AND: [scope, { status: { not: "INACTIVE" } }] } },
              select: {
                employeeId: true, status: true, overtimeHours: true,
                punchInAt: true, punchOutAt: true, punchInLat: true, punchInLng: true, punchOutLat: true, punchOutLng: true,
              },
            }),
      ])
    : [[], []];

  const report = canReport && range.ok && !listing ? await loadAttendanceReport(prisma, range, peopleParams, scope) : [];

  /*
   * The band reads everyone in view and today's marks against them, so it
   * does not move when somebody searches. "Not marked" is the figure that
   * actually gets acted on.
   */
  const statRows = await prisma.employee.findMany({
    where: { AND: [scope, employeeGroupWhere(listParams.group)] },
    select: {
      status: true,
      attendance: Number.isNaN(markDate.getTime())
        ? { where: { id: "none" }, select: { status: true, overtimeHours: true } }
        : { where: { attendanceOn: markDate }, select: { status: true, overtimeHours: true } },
    },
  });

  const referrers = listing && ctx.has(PERM.hr.employee.create) ? await loadReferrers() : [];

  const pendingEdits = ctx.has(PERM.hr.employee.update)
    ? await prisma.profileEditRequest.count({ where: { status: "PENDING", employee: employeeScope(ctx) } })
    : 0;

  return (
    <div>
      {ctx.has(PERM.hr.employee.update) && (
        <p className="mb-3 text-sm">
          <Link href="/hr/edit-requests" className="font-medium text-brand-600 hover:underline">
            Profile change requests{pendingEdits ? ` · ${pendingEdits} waiting` : ""} →
          </Link>
        </p>
      )}
      <ModuleStats figures={employeeFigures(statRows)} />
      <HrScreen
        tabs={tabs}
        newLabel={view === "staff" ? "+ New staff member" : "+ New rider"}
        defaultTypeId={
          employmentTypes.find((t) => (view === "staff" ? t.name.trim().toLowerCase() === "internal staff" : isRiderType(t.name)))?.id ?? null
        }
        tab={tab}
        date={date}
        from={range.from}
        to={range.to}
        rangeError={range.ok ? null : range.error}
        employees={employees.map((e) => ({
          id: e.id,
          code: e.employeeCode,
          name: e.name,
          mobile: e.mobile,
          altContact: e.altContact,
          aadhaar: canIdentity ? e.aadhaar : maskId(e.aadhaar),
          pan: canIdentity ? e.pan : maskId(e.pan),
          address: e.address,
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
        }))}
        markable={markable.map((e) => ({
          id: e.id,
          code: e.employeeCode,
          name: e.name,
          employmentType: e.employmentType.name,
          designation: e.designation?.name ?? null,
        }))}
        employmentTypes={employmentTypes.map((t) => ({
          id: t.id,
          name: t.name,
          count: t._count.employees,
          canDelete: t._count.employees === 0,
        }))}
        designations={designations}
        companies={companies}
        referrers={referrers}
        dayMarks={dayEntries.map((e) => ({
          employeeId: e.employeeId,
          status: e.status,
          overtimeHours: Number(e.overtimeHours),
          checkIn: e.punchInAt ? istClock(e.punchInAt) : null,
          checkOut: e.punchOutAt ? istClock(e.punchOutAt) : null,
          inMap: mapsHref(e.punchInLat === null ? null : Number(e.punchInLat), e.punchInLng === null ? null : Number(e.punchInLng)),
          outMap: mapsHref(e.punchOutLat === null ? null : Number(e.punchOutLat), e.punchOutLng === null ? null : Number(e.punchOutLng)),
          noCheckOut: Boolean(e.punchInAt && !e.punchOutAt && date < today),
        }))}
        report={report}
        can={{
          tabStaff: ctx.has(PERM.hr.employee.tabStaff),
          create: ctx.has(PERM.hr.employee.create),
          createStaff: ctx.has(PERM.hr.employee.createStaff),
          decide: ctx.has(PERM.approvals.queue.decide),
          update: ctx.has(PERM.hr.employee.update),
          remove: ctx.has(PERM.hr.employee.delete),
          viewIdentity: canIdentity,
          manageCompanies: ctx.has(PERM.hr.employee.manageCompanies),
          manageTypes: ctx.has(PERM.hr.employmentType.create),
          deleteTypes: ctx.has(PERM.hr.employmentType.delete),
          viewAttendance: canViewAttendance,
          mark: ctx.has(PERM.hr.attendance.mark),
          markAll: ctx.has(PERM.hr.attendance.markAll),
          report: canReport,
          exportReport: canViewAttendance && canReport && ctx.has(PERM.hr.attendance.export),
          exportEmployees: ctx.has(PERM.hr.employee.export),
        }}
      />
    </div>
  );
}

/** Who may be picked as "Referred by": active, accepted riders. */
export async function loadReferrers() {
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
