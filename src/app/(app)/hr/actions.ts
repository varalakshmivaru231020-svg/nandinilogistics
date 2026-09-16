"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { markAttendance } from "@/lib/hr/attendance-marking";
import { editableEmployee, maskIdentityChanges } from "@/lib/hr/employee-audit";
import { checkStatusChange, claimEmployeeStatus, statusLabel } from "@/lib/hr/employee-status";
import { FileTooLargeError, UnsupportedFileTypeError, put, remove } from "@/lib/storage";

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

/** The two copies the design's form takes, and nothing else. */
const DOC_KINDS = ["Aadhaar card", "PAN card"] as const;

/** Stores one uploaded file, turning the storage rules into form errors. */
async function store(employeeId: string, file: File) {
  try {
    return await put(`employee-${employeeId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

/**
 * Saves the photo and the identity copies the design's form offers. Replacing
 * one removes what it replaced, so nothing is orphaned in storage.
 */
async function saveFiles(employeeId: string, formData: FormData, uploadedById: string) {
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const previous = await prisma.employee.findUnique({ where: { id: employeeId }, select: { photoKey: true } });
    const stored = await store(employeeId, photo);
    await prisma.employee.update({ where: { id: employeeId }, data: { photoKey: stored.key } });
    if (previous?.photoKey) await remove(previous.photoKey).catch(() => undefined);
  }

  for (const kind of DOC_KINDS) {
    const file = formData.get(`doc:${kind}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const previous = await prisma.employeeDocument.findUnique({
      where: { employeeId_kind: { employeeId, kind } },
      select: { storageKey: true },
    });
    const stored = await store(employeeId, file);
    await prisma.employeeDocument.upsert({
      where: { employeeId_kind: { employeeId, kind } },
      create: {
        employeeId, kind, storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
      update: {
        storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
    });
    if (previous?.storageKey) await remove(previous.storageKey).catch(() => undefined);
  }
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

    await saveFiles(employee.id, formData, ctx.id);

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

    const data = {
      name: v.name,
      mobile: v.mobile,
      aadhaar: v.aadhaar,
      pan: v.pan || null,
      address: v.address || null,
      altContact: v.altContact || null,
      employmentTypeId: v.employmentTypeId,
      designationId: v.designationId || null,
    };
    await prisma.employee.update({ where: { id }, data });
    await saveFiles(id, formData, ctx.id);

    // Every field the form changed; Aadhaar and PAN masked to their last four.
    const changes = maskIdentityChanges(diff(editableEmployee(before), editableEmployee(data)));
    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: changes
        ? `${v.name} updated — ${Object.keys(changes).join(", ")}`
        : `${v.name} saved with no changes`,
      changes,
    });
    revalidatePath("/hr");
    return null;
  });
}

/**
 * Activates or deactivates an employee. Deactivating needs a reason. The write
 * is claimed against the status that was read, so a concurrent change wins
 * rather than being overwritten.
 */
export async function setEmployeeStatusAction(
  id: string,
  status: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.update);
    const before = await prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!before) throw new Error("Employee not found.");

    const change = checkStatusChange(before.status, status, reason);
    if (!change.ok) throw new Error(change.error);

    const claimed = await claimEmployeeStatus(prisma, id, before.status, change.next);
    if (!claimed) {
      throw new Error(`${before.name}'s status was changed by someone else. Reload and try again.`);
    }

    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${before.name} marked ${statusLabel(change.next).toLowerCase()}${change.reason ? ` — ${change.reason}` : ""}`,
      changes: {
        status: { from: before.status, to: change.next },
        ...(change.reason ? { reason: { from: null, to: change.reason } } : {}),
      },
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

/**
 * Marking is idempotent on (employee, date): re-marking a day corrects it
 * rather than stacking a second row. Inactive employees are refused inside
 * `markAttendance()`, under a lock, and nothing is written for the batch.
 */
export async function markAttendanceAction(
  attendanceOn: string,
  marks: Array<{ employeeId: string; status: string; overtimeHours?: number }>,
  projectId?: string,
): Promise<ActionResult<{ marked: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.attendance.mark);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceOn)) throw new Error("Pick a valid date.");
    const date = new Date(`${attendanceOn}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Pick a valid date.");
    if (date.getTime() > Date.now() + 86_400_000) {
      throw new Error("Attendance cannot be marked for a future date.");
    }
    if (!marks.length) throw new Error("Nothing to mark.");

    const marked = await prisma.$transaction((tx) =>
      markAttendance(tx, { date, marks, projectId: projectId || null, markedById: ctx.id }),
    );

    await recordAudit({
      action: "UPDATE", entity: "AttendanceEntry", userId: ctx.id, projectId: projectId || undefined,
      summary: `${marked} marked for ${attendanceOn}`,
    });
    revalidatePath("/hr");
    return { marked };
  });
}
