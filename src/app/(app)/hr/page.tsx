import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeListWhere, maskId, readEmployeeListParams } from "@/lib/hr/list-filters";
import { parseAttendanceRange } from "@/lib/hr/attendance-report";
import { loadAttendanceReport } from "@/lib/hr/attendance-report-data";
import { HrScreen } from "./hr-screen";

export const metadata = { title: "Users & Attendance" };

export default async function WorkforcePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; date?: string; from?: string; to?: string;
    q?: string; type?: string; designation?: string; status?: string;
  }>;
}) {
  const ctx = await requirePermission(PERM.hr.employee.view);
  const today = new Date().toISOString().slice(0, 10);
  const raw = await searchParams;
  const { tab = "staff", date = today } = raw;
  const range = parseAttendanceRange({ from: raw.from, to: raw.to }, today);
  const listParams = readEmployeeListParams(raw);
  // Mark Attendance and the report narrow by search, type and designation only.
  const peopleParams = { ...listParams, status: "" as const };

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const canViewAttendance = ctx.has(PERM.hr.attendance.view);
  const canReport = ctx.has(PERM.hr.attendance.tabReport);

  const [employees, employmentTypes, designations] = await Promise.all([
    prisma.employee.findMany({
      // Search, employment type, designation and status — the same function the export uses.
      where: employeeListWhere(listParams),
      orderBy: { name: "asc" },
      include: {
        employmentType: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        documents: { select: { id: true, kind: true, fileName: true, fileSize: true } },
      },
    }),
    prisma.employmentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { employees: true } } },
    }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // The day being marked: active employees only, and only their marks — an
  // inactive employee's earlier mark must not be re-submitted with the day.
  const markDate = new Date(`${date}T00:00:00.000Z`);
  const [markable, dayEntries] = canViewAttendance
    ? await Promise.all([
        prisma.employee.findMany({
          where: employeeListWhere({ ...peopleParams, status: "ACTIVE" }),
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
              where: { attendanceOn: markDate, employee: { status: { not: "INACTIVE" } } },
              select: { employeeId: true, status: true, overtimeHours: true },
            }),
      ])
    : [[], []];

  const report = canReport && range.ok ? await loadAttendanceReport(prisma, range, peopleParams) : [];

  return (
    <div>
      <HrScreen
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
          employmentTypeId: e.employmentType.id,
          employmentType: e.employmentType.name,
          designationId: e.designation?.id ?? null,
          designation: e.designation?.name ?? null,
          status: e.status,
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
        dayMarks={dayEntries.map((e) => ({
          employeeId: e.employeeId,
          status: e.status,
          overtimeHours: Number(e.overtimeHours),
        }))}
        report={report}
        can={{
          tabStaff: ctx.has(PERM.hr.employee.tabStaff),
          create: ctx.has(PERM.hr.employee.create),
          update: ctx.has(PERM.hr.employee.update),
          remove: ctx.has(PERM.hr.employee.delete),
          viewIdentity: canIdentity,
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
