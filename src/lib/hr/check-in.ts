import type { Prisma, PrismaClient } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import { attendanceDay, checkInCard, type CheckInCard } from "@/lib/hr/punch";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Today's Check in / Check out state for the signed-in person, or null when
 * they have nothing to check in to: no punch permission, or no active,
 * accepted person record linked to their login. "Today" is the Indian day of
 * the `now` the layout read once.
 */
export async function loadCheckIn(
  db: Db,
  viewer: { id: string; has: (code: string) => boolean },
  now: Date,
): Promise<CheckInCard | null> {
  if (!viewer.has(PERM.hr.attendance.punch)) return null;
  const employee = await db.employee.findUnique({
    where: { userId: viewer.id },
    select: { id: true, status: true, onboardingStatus: true },
  });
  if (!employee || employee.status !== "ACTIVE" || employee.onboardingStatus !== "ACCEPTED") return null;
  const today = await db.attendanceEntry.findUnique({
    where: { employeeId_attendanceOn: { employeeId: employee.id, attendanceOn: attendanceDay(now) } },
    select: { status: true, punchInAt: true, punchOutAt: true },
  });
  return checkInCard(today);
}
