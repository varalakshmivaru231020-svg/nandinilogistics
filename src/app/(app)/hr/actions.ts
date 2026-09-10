"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

/**
 * The design makes name, mobile, photo and Aadhaar mandatory on an employee.
 * Photo is enforced in the form; the rest here, where it cannot be bypassed.
 */
const EmployeeSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  mobile: z.string().trim().min(8, "A valid mobile number is required"),
  aadhaar: z.string().trim().min(12, "Aadhaar is required"),
  pan: z.string().trim().optional(),
  address: z.string().trim().optional(),
  altContact: z.string().trim().optional(),
  employmentTypeId: z.string().min(1, "Employment type is required"),
  designationId: z.string().optional(),
});

function nextEmployeeCode(count: number) {
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}

export async function createEmployeeAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.create);
    const parsed = EmployeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const employee = await prisma.$transaction(async (tx) => {
      const count = await tx.employee.count();
      return tx.employee.create({
        data: {
          employeeCode: nextEmployeeCode(count),
          name: v.name,
          mobile: v.mobile,
          aadhaar: v.aadhaar,
          pan: v.pan || null,
          address: v.address || null,
          altContact: v.altContact || null,
          employmentTypeId: v.employmentTypeId,
          designationId: v.designationId || null,
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Employee", entityId: employee.id, userId: ctx.id,
      summary: `Added ${employee.name} to the user master`,
    });
    revalidatePath("/hr");
    return { id: employee.id };
  });
}

export async function updateEmployeeAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.update);
    const parsed = EmployeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) throw new Error("Employee not found.");

    await prisma.employee.update({
      where: { id },
      data: {
        name: v.name,
        mobile: v.mobile,
        aadhaar: v.aadhaar,
        pan: v.pan || null,
        address: v.address || null,
        altContact: v.altContact || null,
        employmentTypeId: v.employmentTypeId,
        designationId: v.designationId || null,
      },
    });
    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${v.name} updated`,
      changes: { name: { from: before.name, to: v.name } },
    });
    revalidatePath("/hr");
    return null;
  });
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.delete);
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { _count: { select: { attendance: true } } },
    });
    if (!employee) throw new Error("Employee not found.");
    if (employee._count.attendance > 0) {
      throw new Error(
        `${employee.name} has ${employee._count.attendance} attendance record(s). Mark them inactive instead of deleting.`,
      );
    }
    await prisma.employee.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `Removed ${employee.name}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/* --------------------------- Employment types ----------------------------- */

export async function createEmploymentTypeAction(name: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employmentType.create);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A name is required.");

    const existing = await prisma.employmentType.findUnique({ where: { name: trimmed } });
    if (existing) throw new Error(`"${trimmed}" already exists.`);

    await prisma.employmentType.create({ data: { name: trimmed } });
    await recordAudit({
      action: "CREATE", entity: "EmploymentType", userId: ctx.id,
      summary: `Employment type added — ${trimmed}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/** The design only offers the delete when the type carries nobody. */
export async function deleteEmploymentTypeAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employmentType.delete);
    const type = await prisma.employmentType.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!type) throw new Error("Employment type not found.");
    if (type._count.employees > 0) {
      throw new Error(`${type.name} still carries ${type._count.employees} employee(s).`);
    }
    await prisma.employmentType.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "EmploymentType", entityId: id, userId: ctx.id,
      summary: `Employment type removed — ${type.name}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/* -------------------------------- Attendance ------------------------------ */

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Marking is idempotent on (employee, date): re-marking a day corrects it
 * rather than stacking a second row. That invariant lives on the unique index,
 * not only here.
 */
export async function markAttendanceAction(
  attendanceOn: string,
  marks: Array<{ employeeId: string; status: string; overtimeHours?: number }>,
  projectId?: string,
): Promise<ActionResult<{ marked: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.attendance.mark);
    const date = new Date(`${attendanceOn}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Pick a valid date.");
    if (date.getTime() > Date.now() + 86_400_000) {
      throw new Error("Attendance cannot be marked for a future date.");
    }
    if (!marks.length) throw new Error("Nothing to mark.");

    for (const m of marks) {
      if (!STATUSES.includes(m.status as Status)) throw new Error(`Unknown status ${m.status}.`);
    }

    await prisma.$transaction(
      marks.map((m) =>
        prisma.attendanceEntry.upsert({
          where: { employeeId_attendanceOn: { employeeId: m.employeeId, attendanceOn: date } },
          create: {
            employeeId: m.employeeId,
            attendanceOn: date,
            status: m.status as Status,
            overtimeHours: m.status === "ABSENT" ? 0 : (m.overtimeHours ?? 0),
            projectId: projectId || null,
            markedById: ctx.id,
          },
          update: {
            status: m.status as Status,
            overtimeHours: m.status === "ABSENT" ? 0 : (m.overtimeHours ?? 0),
            projectId: projectId || null,
            markedById: ctx.id,
          },
        }),
      ),
    );

    await recordAudit({
      action: "UPDATE", entity: "AttendanceEntry", userId: ctx.id, projectId: projectId || undefined,
      summary: `${marks.length} marked for ${attendanceOn}`,
    });
    revalidatePath("/hr");
    return { marked: marks.length };
  });
}
