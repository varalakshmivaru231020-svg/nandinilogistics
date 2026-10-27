import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { dateCondition } from "@/lib/reports/filters";
import { employeeListWhere, type EmployeeListParams } from "@/lib/hr/list-filters";
import { istClock } from "@/lib/hr/punch";
import { summarizeAttendance, type AttendanceSummaryRow } from "@/lib/hr/attendance-report";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The attendance report's rows, for the page and the export alike.
 *
 * Employees are narrowed by the list's search, type and designation — never by
 * status: an active employee always appears, and an inactive one appears when
 * they have attendance in the range, so days recorded before deactivation stay
 * in the report.
 */
export async function loadAttendanceReport(
  db: Db,
  range: { from: string; to: string },
  listParams: EmployeeListParams,
  /** Who the viewer may see — `employeeScope(ctx)`; everyone when omitted. */
  scope: Prisma.EmployeeWhereInput = {},
): Promise<AttendanceSummaryRow[]> {
  const attendanceOn = dateCondition(range);
  const [employees, entries] = await Promise.all([
    db.employee.findMany({
      where: {
        AND: [
          scope,
          employeeListWhere({ ...listParams, status: "" }),
          { OR: [{ status: { not: "INACTIVE" } }, { attendance: { some: { attendanceOn } } }] },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true, employeeCode: true, name: true, status: true,
        employmentType: { select: { name: true } },
        designation: { select: { name: true } },
      },
    }),
    db.attendanceEntry.findMany({
      where: { attendanceOn, employee: { AND: [scope, employeeListWhere({ ...listParams, status: "" })] } },
      select: { employeeId: true, attendanceOn: true, status: true, overtimeHours: true, punchInAt: true, punchOutAt: true },
    }),
  ]);

  return summarizeAttendance(
    employees.map((e) => ({
      id: e.id,
      code: e.employeeCode,
      name: e.name,
      employmentType: e.employmentType.name,
      designation: e.designation?.name ?? null,
      status: e.status,
    })),
    entries.map((e) => ({
      employeeId: e.employeeId,
      attendanceOn: e.attendanceOn.toISOString().slice(0, 10),
      status: e.status,
      overtimeHours: Number(e.overtimeHours),
      checkIn: e.punchInAt ? istClock(e.punchInAt) : null,
      checkOut: e.punchOutAt ? istClock(e.punchOutAt) : null,
    })),
    range,
  );
}
