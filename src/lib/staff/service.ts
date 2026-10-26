import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { advanceDueThisMonth, monthRange, payableDays } from "./payslip";

type Db = PrismaClient | Prisma.TransactionClient;

/** The employment type that marks somebody as internal staff, by name. */
export const INTERNAL_STAFF_TYPE = "internal staff";

export async function internalStaff(db: Db) {
  return db.employee.findMany({
    where: {
      status: "ACTIVE",
      employmentType: { name: { equals: "Internal Staff", mode: "insensitive" } },
    },
    orderBy: { name: "asc" },
    select: { id: true, employeeCode: true, name: true, monthlySalary: true, designation: { select: { name: true } } },
  });
}

/**
 * What a payslip for this person and month would start from: their salary,
 * the days the attendance sheet pays for, and the advance recovery due.
 */
export async function payslipDraft(db: Db, employeeId: string, month: string) {
  const { from, to } = monthRange(month);
  const [employee, entries, advances] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, employeeCode: true, monthlySalary: true },
    }),
    db.attendanceEntry.findMany({ where: { employeeId, attendanceOn: { gte: from, lt: to } }, select: { status: true } }),
    db.advance.findMany({
      where: { employeeId, status: "APPROVED" },
      select: { amount: true, recoveredAmount: true, recoveryPerPeriod: true },
    }),
  ]);
  if (!employee) throw new Error("Staff member not found.");
  return {
    employee,
    gross: employee.monthlySalary === null ? 0 : Number(employee.monthlySalary),
    payableDays: payableDays(entries),
    marked: entries.length,
    advance: advanceDueThisMonth(advances),
  };
}
