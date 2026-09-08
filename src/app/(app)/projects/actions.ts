"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const ProjectSchema = z.object({
  code: z.string().trim().min(2, "Project code is required").toUpperCase(),
  name: z.string().trim().min(2, "Project name is required"),
  projectTypeId: z.string().trim().min(1, "Project type is required"),
  companyId: z.string().trim().optional(),
  cityId: z.string().trim().optional(),
  addressLine: z.string().trim().optional(),
  reraNumber: z.string().trim().optional(),
  landArea: z.coerce.number().min(0).optional(),
  totalTowers: z.coerce.number().int().min(0).optional(),
  totalFloors: z.coerce.number().int().min(0).optional(),
  budgetAmount: z.coerce.number().min(0).optional(),
  startDate: z.string().trim().optional(),
  targetDate: z.string().trim().optional(),
  projectManagerId: z.string().trim().optional(),
  description: z.string().trim().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
});

function toData(v: z.infer<typeof ProjectSchema>) {
  return {
    code: v.code,
    name: v.name,
    projectTypeId: v.projectTypeId,
    companyId: v.companyId || null,
    cityId: v.cityId || null,
    addressLine: v.addressLine || null,
    reraNumber: v.reraNumber || null,
    landArea: v.landArea ?? 0,
    totalTowers: v.totalTowers ?? 0,
    totalFloors: v.totalFloors ?? 0,
    budgetAmount: v.budgetAmount ?? 0,
    startDate: v.startDate ? new Date(v.startDate) : null,
    targetDate: v.targetDate ? new Date(v.targetDate) : null,
    projectManagerId: v.projectManagerId || null,
    description: v.description || null,
    ...(v.status ? { status: v.status } : {}),
  };
}

export async function createProjectAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.project.create);
    const parsed = ProjectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const project = await prisma.project.create({ data: toData(parsed.data) });

    // The creator keeps access to what they just created.
    await prisma.userProject.create({ data: { userId: ctx.id, projectId: project.id } }).catch(() => undefined);

    await recordAudit({
      action: "CREATE", entity: "Project", entityId: project.id, userId: ctx.id,
      projectId: project.id, summary: `Created project ${project.code} — ${project.name}`,
    });
    revalidatePath("/projects");
    return { id: project.id };
  });
}

export async function updateProjectAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.project.update);
    assertProjectAccess(ctx, id);

    const parsed = ProjectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const before = await prisma.project.findUnique({ where: { id } });
    if (!before) throw new Error("Project not found.");

    const after = await prisma.project.update({ where: { id }, data: toData(parsed.data) });

    await recordAudit({
      action: "UPDATE", entity: "Project", entityId: id, userId: ctx.id, projectId: id,
      summary: `Updated project ${after.code}`, changes: diff(before, after),
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return null;
  });
}

/* ------------------------------ Work breakdown ----------------------------- */

export async function createPhaseAction(projectId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.phase.create);
    assertProjectAccess(ctx, projectId);

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const sequence = Number(formData.get("sequence") ?? 0);
    if (!code || !name) throw new Error("Phase code and name are required.");

    await prisma.projectPhase.create({ data: { projectId, code, name, sequence } });
    await recordAudit({
      action: "CREATE", entity: "ProjectPhase", userId: ctx.id, projectId,
      summary: `Added phase ${code} — ${name}`,
    });
    revalidatePath(`/projects/${projectId}`);
    return null;
  });
}

export async function createWorkPackageAction(
  projectId: string, phaseId: string, formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.workPackage.create);
    assertProjectAccess(ctx, projectId);

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    if (!code || !name) throw new Error("Work package code and name are required.");

    await prisma.workPackage.create({ data: { phaseId, code, name } });
    await recordAudit({
      action: "CREATE", entity: "WorkPackage", userId: ctx.id, projectId,
      summary: `Added work package ${code} — ${name}`,
    });
    revalidatePath(`/projects/${projectId}`);
    return null;
  });
}
