import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { exportGate, exportResponse } from "@/lib/exports/respond";
import { formatDuration, sessionMinutes, summarizeHours } from "@/lib/hr/attendance-hours";
import { istClock, monthRange } from "@/lib/hr/punch";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * One person's own month of attendance as PDF, Excel or CSV — the app's
 * "Export monthly attendance". The record is found from the login, never from
 * a parameter, so nobody can download another rider's month.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.hr.attendance.exportOwn);
  if (!gate.ok) return gate.response;
  if (gate.format === "json") return new NextResponse("Choose csv, xlsx or pdf.", { status: 400 });

  const month = gate.params.get("month") ?? new Date().toISOString().slice(0, 7);
  const range = monthRange(month);
  if (!range) return new NextResponse("month must be yyyy-mm.", { status: 400 });

  const employee = await prisma.employee.findUnique({
    where: { userId: gate.ctx.id },
    select: { id: true, name: true, employeeCode: true, temporaryCity: true, temporaryState: true },
  });
  if (!employee) return new NextResponse("There is no rider record linked to your login.", { status: 404 });

  const rows = await prisma.attendanceEntry.findMany({
    where: { employeeId: employee.id, attendanceOn: { gte: range.from, lt: range.to } },
    orderBy: { attendanceOn: "asc" },
    select: { attendanceOn: true, status: true, punchInAt: true, punchOutAt: true },
  });
  const days = rows.map((r) => ({
    date: r.attendanceOn.toISOString().slice(0, 10),
    status: r.status,
    punchInAt: r.punchInAt,
    punchOutAt: r.punchOutAt,
  }));
  const hours = summarizeHours(days);
  const [y, m] = month.split("-").map(Number);
  const label = `${MONTHS[m - 1]} ${y}`;
  const location = [employee.temporaryCity, employee.temporaryState].filter(Boolean).join(", ");

  return exportResponse({
    ...gate,
    title: `Attendance ${employee.employeeCode} ${month}`,
    entity: "AttendanceEntry",
    filters: `${employee.name} (${employee.employeeCode}) · ${label}`,
    result: {
      columns: [
        { key: "date", header: "Date", format: "date" },
        { key: "day", header: "Day" },
        { key: "in", header: "Punch in", align: "right" },
        { key: "out", header: "Punch out", align: "right" },
        { key: "hours", header: "Hours", align: "right" },
        { key: "status", header: "Status" },
      ],
      rows: days.map((d) => {
        const mins = sessionMinutes(d.punchInAt, d.punchOutAt);
        const incomplete = Boolean(d.punchInAt && !d.punchOutAt);
        return {
          date: d.date,
          day: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" }),
          in: d.punchInAt ? istClock(d.punchInAt) : "—",
          out: d.punchOutAt ? istClock(d.punchOutAt) : incomplete ? "Not recorded" : "—",
          hours: mins === null ? "—" : formatDuration(mins),
          status: incomplete ? "Incomplete" : (STATUS[d.status] ?? d.status),
        };
      }),
      summary: [
        { label: "Rider", value: `${employee.name} · ${employee.employeeCode}${location ? ` · ${location}` : ""}` },
        { label: "Month", value: label },
        { label: "Working days", value: String(hours.workingDays) },
        { label: "Present", value: String(hours.present), tone: "good" },
        { label: "Half day", value: String(hours.halfDay) },
        { label: "Absent", value: String(hours.absent), tone: hours.absent ? "bad" : "default" },
        { label: "Incomplete", value: String(hours.incomplete), tone: hours.incomplete ? "warn" : "default" },
        { label: "Total hours", value: formatDuration(hours.totalMinutes) },
        { label: "Average per day", value: hours.averageMinutes === null ? "—" : formatDuration(hours.averageMinutes) },
      ],
      emptyMessage: `No attendance recorded in ${label}.`,
    },
  });
}
