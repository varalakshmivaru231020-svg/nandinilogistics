import { prisma } from "@/lib/db";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";
import { attendanceDay, monthRange, punchState } from "@/lib/hr/punch";
import { PERM } from "@/lib/permissions/codes";

/**
 * The caller's own attendance for a month, and where today's punch stands —
 * the app's monthly attendance report and its punch button.
 */
export const GET = mobileRoute([PERM.hr.attendance.view], async (req, actor) => {
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
  return apiOk({
    month,
    days: rows.map((r) => ({
      date: r.attendanceOn.toISOString().slice(0, 10),
      status: r.status,
      punchInAt: iso(r.punchInAt),
      punchOutAt: iso(r.punchOutAt),
    })),
    summary: {
      present: rows.filter((r) => r.status === "PRESENT").length,
      halfDay: rows.filter((r) => r.status === "HALF_DAY").length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
    },
    today: {
      date: todayOn.toISOString().slice(0, 10),
      state: punchState(today),
      status: today?.status ?? null,
      punchInAt: iso(today?.punchInAt ?? null),
      punchOutAt: iso(today?.punchOutAt ?? null),
    },
    serverTime: now.toISOString(),
  });
});
