import Link from "next/link";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeGroupWhere, employeeListWhere, employeeScope, readEmployeeListParams } from "@/lib/hr/list-filters";
import { parseAttendanceRange } from "@/lib/hr/attendance-report";
import { loadAttendanceReport } from "@/lib/hr/attendance-report-data";
import { ModuleStats } from "@/components/list/module-stats";
import { employeeFigures } from "@/lib/metrics/figures";
import { attendanceDay, istClock, mapsHref } from "@/lib/hr/punch";
import { EMPLOYEE_FORM_INCLUDE, employeeFormRow } from "./employee-form-data";
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
  // Today on the Indian calendar — punches are filed under the IST day, and a
  // UTC "today" opened on yesterday between midnight and 05:30.
  const today = attendanceDay(new Date()).toISOString().slice(0, 10);
  const raw = await searchParams;
  const tabs = view === "attendance" ? ["mark", "log", "report"] : ["staff"];
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
  const canLog = ctx.has(PERM.hr.attendance.tabLog);

  const listing = view !== "attendance";
  const employees = !listing ? [] : await prisma.employee.findMany({
    // Search, employment type, designation and status — the same function the export uses.
    where: { AND: [scope, employeeListWhere(listParams)] },
    orderBy: { name: "asc" },
    include: EMPLOYEE_FORM_INCLUDE,
  });

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
   * The punch log: every attendance row in the range, newest day first, with
   * where each punch came from. This is where a rider's or a staff member's
   * check-in from the phone is seen on the web — the mark tab shows one day,
   * the report sums a range, and neither answered "who checked in, when".
   */
  const logEntries = canLog && range.ok && !listing && tab === "log"
    ? await prisma.attendanceEntry.findMany({
        where: {
          attendanceOn: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) },
          employee: { AND: [scope, employeeListWhere(peopleParams)] },
        },
        orderBy: [{ attendanceOn: "desc" }, { punchInAt: "asc" }, { employee: { name: "asc" } }],
        take: 1500,
        select: {
          id: true, attendanceOn: true, status: true, overtimeHours: true,
          punchInAt: true, punchOutAt: true, punchInLat: true, punchInLng: true, punchOutLat: true, punchOutLng: true,
          markedById: true,
          employee: { select: { name: true, employeeCode: true, userId: true, employmentType: { select: { name: true } } } },
          markedBy: { select: { name: true } },
        },
      })
    : [];

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
        view={view}
        newLabel={view === "staff" ? "+ New staff member" : "+ New rider"}
        tab={tab}
        date={date}
        from={range.from}
        to={range.to}
        rangeError={range.ok ? null : range.error}
        employees={employees.map((e) => employeeFormRow(e, canIdentity))}
        markable={markable.map((e) => ({
          id: e.id,
          code: e.employeeCode,
          name: e.name,
          employmentType: e.employmentType.name,
          designation: e.designation?.name ?? null,
        }))}
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
        log={logEntries.map((e) => {
          const day = e.attendanceOn.toISOString().slice(0, 10);
          const self = e.markedById !== null && e.markedById === e.employee.userId;
          const hours = e.punchInAt && e.punchOutAt ? (e.punchOutAt.getTime() - e.punchInAt.getTime()) / 3_600_000 : null;
          return {
            id: e.id,
            date: day,
            name: e.employee.name,
            code: e.employee.employeeCode,
            employmentType: e.employee.employmentType.name,
            status: e.status,
            overtimeHours: Number(e.overtimeHours),
            checkIn: e.punchInAt ? istClock(e.punchInAt) : null,
            checkOut: e.punchOutAt ? istClock(e.punchOutAt) : null,
            hours: hours === null ? null : Math.round(hours * 10) / 10,
            inMap: mapsHref(e.punchInLat === null ? null : Number(e.punchInLat), e.punchInLng === null ? null : Number(e.punchInLng)),
            outMap: mapsHref(e.punchOutLat === null ? null : Number(e.punchOutLat), e.punchOutLng === null ? null : Number(e.punchOutLng)),
            source: e.punchInAt
              ? (self ? "App / check-in" : e.markedBy ? `Punched · corrected by ${e.markedBy.name}` : "App / check-in")
              : e.markedBy ? `Marked by ${e.markedBy.name}` : "Marked",
            noCheckOut: Boolean(e.punchInAt && !e.punchOutAt && day < today),
          };
        })}
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
          log: canLog,
          exportReport: canViewAttendance && canReport && ctx.has(PERM.hr.attendance.export),
          exportEmployees: ctx.has(PERM.hr.employee.export),
        }}
      />
    </div>
  );
}
