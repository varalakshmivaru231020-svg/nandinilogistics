import { Prisma } from "@prisma/client";

import { isInactive } from "@/lib/hr/employee-status";

export const ATTENDANCE_MARKS = ["PRESENT", "ABSENT", "HALF_DAY"] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

export interface MarkInput {
  employeeId: string;
  status: string;
  overtimeHours?: number;
}

/**
 * Writes a day's marks inside the caller's transaction.
 *
 * Marking is idempotent on (employee, date): re-marking corrects the day. Every
 * employee must exist and be active — checked here, under a share lock on the
 * employee rows, so a deactivation cannot slip in between the check and the
 * write. Throws (writing nothing, when the caller's transaction rolls back) if
 * any mark is refused.
 */
export async function markAttendance(
  tx: Prisma.TransactionClient,
  input: { date: Date; marks: MarkInput[]; projectId: string | null; markedById: string },
): Promise<number> {
  const { date, marks, projectId, markedById } = input;
  if (!marks.length) throw new Error("Nothing to mark.");

  const byEmployee = new Map<string, MarkInput>();
  for (const m of marks) {
    if (!ATTENDANCE_MARKS.includes(m.status as AttendanceMark)) throw new Error(`Unknown status ${m.status}.`);
    const ot = m.status === "ABSENT" ? 0 : Number(m.overtimeHours ?? 0);
    if (!Number.isFinite(ot) || ot < 0 || ot > 24) throw new Error("Overtime must be between 0 and 24 hours.");
    byEmployee.set(m.employeeId, { ...m, overtimeHours: ot });
  }

  const ids = [...byEmployee.keys()];
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; status: string }>>`
    SELECT id, name, status FROM employees WHERE id IN (${Prisma.join(ids)}) FOR SHARE`;

  if (rows.length !== ids.length) throw new Error("One or more employees could not be found.");
  const inactive = rows.filter((r) => isInactive(r.status));
  if (inactive.length) {
    throw new Error(
      `${inactive.map((r) => r.name).join(", ")} ${inactive.length === 1 ? "is" : "are"} inactive — attendance cannot be marked.`,
    );
  }

  for (const m of byEmployee.values()) {
    const status = m.status as AttendanceMark;
    await tx.attendanceEntry.upsert({
      where: { employeeId_attendanceOn: { employeeId: m.employeeId, attendanceOn: date } },
      create: {
        employeeId: m.employeeId, attendanceOn: date, status,
        overtimeHours: m.overtimeHours ?? 0, projectId, markedById,
      },
      update: { status, overtimeHours: m.overtimeHours ?? 0, projectId, markedById },
    });
  }
  return byEmployee.size;
}
