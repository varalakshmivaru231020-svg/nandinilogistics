import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { ATTENDANCE_EMPTY, attendanceScreenRow } from "@/lib/screens/rows/hr";
import { attendanceTotals, parseAttendanceRange } from "@/lib/hr/attendance-report";
import { loadAttendanceReport } from "@/lib/hr/attendance-report-data";
import { statusLabel } from "@/lib/hr/employee-status";
import { describeEmployeeFilters, employeeScope, readEmployeeListParams } from "@/lib/hr/list-filters";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/**
 * Exports the attendance report — one row per employee for the from/to range
 * and the Workforce screen's search, type and designation, summarised by the
 * same function the screen uses. No identity numbers are exported.
 */
export async function GET(request: Request) {
  const gate = await exportGate(
    request,
    PERM.hr.attendance.view,
    // The report tab's own permission too: a download must not show a report
    // the user cannot open on screen.
    PERM.hr.attendance.tabReport,
    PERM.hr.attendance.export,
  );
  if (!gate.ok) return gate.response;
  const { params } = gate;

  const range = parseAttendanceRange(
    { from: params.get("from"), to: params.get("to") },
    new Date().toISOString().slice(0, 10),
  );
  if (!range.ok) return new NextResponse(range.error, { status: 400 });

  // Status is not a report filter: see loadAttendanceReport.
  const listParams = { ...readEmployeeListParams(params), status: "" as const };

  const [report, type, designation] = await Promise.all([
    loadAttendanceReport(prisma, range, listParams, employeeScope(gate.ctx)),
    listParams.type
      ? prisma.employmentType.findUnique({ where: { id: listParams.type }, select: { name: true } })
      : null,
    listParams.designation
      ? prisma.designation.findUnique({ where: { id: listParams.designation }, select: { name: true } })
      : null,
  ]);
  const { rows, note } = capRows(report);
  const totals = attendanceTotals(rows);

  /* The screen, for the app: the attendance report row the web's second table
   * draws — the days behind the totals live on the worker's own record. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((r) =>
        attendanceScreenRow({
          id: r.id,
          name: r.name,
          code: r.code,
          employmentType: r.employmentType,
          status: r.status,
          present: r.present,
          half: r.half,
          absent: r.absent,
          payable: r.payable,
          overtime: r.overtime,
        }),
      ),
      empty: ATTENDANCE_EMPTY,
    };
  }

  const filters = [
    `${range.from} to ${range.to} (${range.days} day${range.days === 1 ? "" : "s"})`,
    describeEmployeeFilters(listParams, { type: type?.name ?? null, designation: designation?.name ?? null }),
  ].join(" · ");

  return exportResponse({
    ...gate,
    screen,
    title: "Attendance",
    entity: "AttendanceEntry",
    filters,
    result: {
      columns: [
        { key: "code", header: "Employee code" },
        { key: "name", header: "Employee" },
        { key: "type", header: "Employment type" },
        { key: "designation", header: "Designation" },
        { key: "status", header: "Status" },
        { key: "present", header: "Present", align: "right", format: "number" },
        { key: "half", header: "Half day", align: "right", format: "number" },
        { key: "absent", header: "Absent", align: "right", format: "number" },
        { key: "payable", header: "Payable days", align: "right", format: "number" },
        { key: "overtime", header: "Overtime (hrs)", align: "right", format: "number" },
      ],
      rows: rows.map((r) => ({
        // The worker, whose own record carries the days behind these totals.
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.employmentType,
        designation: r.designation ?? "",
        status: statusLabel(r.status),
        present: r.present,
        half: r.half,
        absent: r.absent,
        payable: r.payable,
        overtime: r.overtime,
      })),
      summary: [
        { label: "Employees", value: note },
        { label: "Payable days", value: String(totals.payable) },
        { label: "Overtime (hrs)", value: String(totals.overtime) },
      ],
      emptyMessage: "No employees match these filters.",
    },
  });
}
