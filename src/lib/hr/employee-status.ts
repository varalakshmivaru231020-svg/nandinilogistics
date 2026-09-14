import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * An employee is ACTIVE or INACTIVE. Inactive people keep their history but
 * cannot be marked for attendance.
 */
export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** Anything that is not explicitly INACTIVE is treated as active. */
export function isInactive(status: string): boolean {
  return status === "INACTIVE";
}

export function statusLabel(status: string): string {
  return isInactive(status) ? "Inactive" : "Active";
}

export type StatusChange =
  | { ok: true; next: EmployeeStatus; reason: string | null }
  | { ok: false; error: string };

/** Whether `current` may move to `next`, and the reason to record. */
export function checkStatusChange(current: string, next: string, reason: string | null | undefined): StatusChange {
  if (!EMPLOYEE_STATUSES.includes(next as EmployeeStatus)) {
    return { ok: false, error: "Status must be ACTIVE or INACTIVE." };
  }
  const wanted = next as EmployeeStatus;
  if (isInactive(current) === isInactive(wanted)) {
    return { ok: false, error: `The employee is already ${statusLabel(wanted).toLowerCase()}.` };
  }
  const trimmed = reason?.trim() ?? "";
  if (wanted === "INACTIVE" && trimmed.length < 3) {
    return { ok: false, error: "Give a reason for deactivating this employee." };
  }
  return { ok: true, next: wanted, reason: trimmed || null };
}

/**
 * Moves the status only if it is still the one the caller read. Returns false
 * when someone else changed it meanwhile — their change stands.
 */
export async function claimEmployeeStatus(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  expected: string,
  next: EmployeeStatus,
): Promise<boolean> {
  const { count } = await db.employee.updateMany({
    where: { id, status: expected },
    data: { status: next },
  });
  return count === 1;
}
