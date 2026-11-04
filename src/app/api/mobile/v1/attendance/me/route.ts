import { prisma } from "@/lib/db";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";
import { formatDuration, sessionMinutes, summarizeHours } from "@/lib/hr/attendance-hours";
import { attendanceDay, monthRange, punchState } from "@/lib/hr/punch";
import { PERM } from "@/lib/permissions/codes";

/**
 * The caller's own attendance for a month, and where today's punch stands —
 * the app's monthly attendance screen and its punch button.
 *
 * One's own record: anyone who may punch may read it, so a tele-caller who
 * holds `punch` but not the team's `view` still sees their own month. Each
 * day carries its completed minutes (null while incomplete) and the month
 * its totals, computed here so the phone, the web and the exports agree.
 */
export const GET = mobileRoute([], async (req, actor) => {
  if (!actor.has(PERM.hr.attendance.view) && !actor.has(PERM.hr.attendance.punch)) {
    return apiFail(403, "You may not see attendance.", PERM.hr.attendance.view);
  }
  const now = new Date();
  const todayOn = attendanceDay(now);
  const month = new URL(req.url).searchParams.get("month") ?? todayOn.toISOString().slice(0, 7);
  const range = monthRange(month);
  if (!range) return apiFail(422, "month must be yyyy-mm.");

  const employee = await prisma.employee.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!employee) return apiFail(404, "There is no rider record linked to your login.", "no-rider");

  const [rows, today] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: { employeeId: employee.id, attendanceOn: { gte: range.from, lt: range.to } },
      orderBy: { attendanceOn: "asc" },
      select: { attendanceOn: true, status: true, punchInAt: true, punchOutAt: true },
    }),
    prisma.attendanceEntry.findUnique({
      where: { employeeId_attendanceOn: { employeeId: employee.id, attendanceOn: todayOn } },
      select: { status: true, punchInAt: true, punchOutAt: true },
    }),
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const days = rows.map((r) => {
    const minutes = sessionMinutes(r.punchInAt, r.punchOutAt);
    return {
      date: r.attendanceOn.toISOString().slice(0, 10),
      status: r.status,
      punchInAt: iso(r.punchInAt),
      punchOutAt: iso(r.punchOutAt),
      minutes,
      hours: minutes === null ? null : formatDuration(minutes),
      incomplete: Boolean(r.punchInAt && !r.punchOutAt),
    };
  });
  const hours = summarizeHours(days);
  const todayMinutes = sessionMinutes(today?.punchInAt ?? null, today?.punchOutAt ?? null);
  return apiOk({
    month,
    days,
    summary: {
      ...hours,
      totalHours: formatDuration(hours.totalMinutes),
      averageHours: hours.averageMinutes === null ? null : formatDuration(hours.averageMinutes),
    },
    today: {
      date: todayOn.toISOString().slice(0, 10),
      state: punchState(today),
      status: today?.status ?? null,
      punchInAt: iso(today?.punchInAt ?? null),
      punchOutAt: iso(today?.punchOutAt ?? null),
      minutes: todayMinutes,
      hours: todayMinutes === null ? null : formatDuration(todayMinutes),
    },
    serverTime: now.toISOString(),
  });
});
