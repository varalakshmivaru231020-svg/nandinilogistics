"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { dateFrom, integerFrom, numberFrom } from "@/lib/parse-input";

/*
 * The design labels these with examples — "4.2 acres", "01 Apr 2027" — so the
 * value that arrives is whatever the example led someone to type. Reading it
 * strictly is what stopped a project being created.
 */
/*
 * Nothing here refuses the form. The design asks for a name and a code and
 * takes the rest as written — land area reads "2 acres 30 guntas" as often as
 * "4.2" — so a measurement keeps the number when there is one and never
 * stands between someone and their project.
 */
const measure = () =>
  z.string().trim().optional().transform((v) => numberFrom(v) ?? undefined);

const count = () =>
  z.string().trim().optional().transform((v) => integerFrom(v) ?? undefined);

/** What was typed, kept verbatim for display. */
const words = () => z.string().trim().optional();

const when = (label: string) =>
  z.string().trim().optional().transform((v, ctx) => {
    const d = dateFrom(v);
    if (d === null) { ctx.addIssue({ code: "custom", message: `${label} is not a date I can read — try 01 Apr 2027.` }); return z.NEVER; }
    return d;
  });

const ProjectSchema = z.object({
  code: z.string().trim().min(2, "Project code is required").toUpperCase(),
  name: z.string().trim().min(2, "Project name is required"),
  projectTypeId: z.string().trim().min(1, "Project type is required"),
  companyId: z.string().trim().optional(),
  cityId: z.string().trim().optional(),
  addressLine: z.string().trim().optional(),
  reraNumber: z.string().trim().optional(),
  landAreaText: words(),
  totalTowers: count(),
  totalFloors: count(),
  totalUnits: count(),
  approvalDetails: z.string().trim().optional(),
  budgetAmount: measure(),
  startDate: when("Planned start"),
  targetDate: when("Target completion"),
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
    landAreaText: v.landAreaText || null,
    // The number read out of those words, so the field stays sortable.
    landArea: numberFrom(v.landAreaText) ?? null,
    totalTowers: v.totalTowers ?? 0,
    totalFloors: v.totalFloors ?? 0,
    totalUnits: v.totalUnits ?? 0,
    approvalDetails: v.approvalDetails || null,
    budgetAmount: v.budgetAmount ?? 0,
    startDate: v.startDate ?? null,
    targetDate: v.targetDate ?? null,
    projectManagerId: v.projectManagerId || null,
    description: v.description || null,
    ...(v.status ? { status: v.status } : {}),
  };
}

/** A phase or work package drafted inside the create dialog, before the project exists. */
export interface DraftWbsRow {
  kind: "PHASE" | "WP";
  code: string;
  name: string;
  /** How far along the breakdown says it is, as the design's dialog asks. */
  progressPct?: number;
}

const clampPct = (v: number | undefined) => Math.min(100, Math.max(0, Math.round(v ?? 0)));

export async function createProjectAction(
  formData: FormData,
  wbs: DraftWbsRow[] = [],
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.project.create);
    const parsed = ProjectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    if (wbs.length && wbs[0].kind !== "PHASE") {
      throw new Error("A work package has to sit under a phase — add a phase first.");
    }

    const project = await prisma.project.create({ data: toData(parsed.data) });

    // The design lets the whole breakdown be drafted in the dialog, so it is
    // written with the project rather than left for a second trip.
    if (wbs.length) {
      let phaseId: string | null = null;
      let phaseSeq = 0;
      for (const row of wbs) {
        if (row.kind === "PHASE") {
          const phase = await prisma.projectPhase.create({
            data: {
              projectId: project.id, code: row.code, name: row.name,
              sequence: phaseSeq++, progressPct: clampPct(row.progressPct),
            },
          });
          phaseId = phase.id;
        } else if (phaseId) {
          await prisma.workPackage.create({
            data: { phaseId, code: row.code, name: row.name, progressPct: clampPct(row.progressPct) },
          });
        }
      }
    }

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


/* ------------------------------ Team mapping ------------------------------ */

/**
 * Mapping a user to a project is what grants them the project — access follows
 * the mapping, per the scope document. So this is an access-control write, and
 * it is audited as one.
 */
export async function mapUserToProjectAction(
  projectId: string, userId: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.team.assign);
    assertProjectAccess(ctx, projectId);

    const [user, project] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, status: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);
    if (!user) throw new Error("User not found.");
    if (user.status !== "ACTIVE") throw new Error(`${user.name} is not an active user.`);
    if (!project) throw new Error("Project not found.");

    const existing = await prisma.userProject.findFirst({ where: { projectId, userId } });
    if (existing) throw new Error(`${user.name} is already mapped to this project.`);

    await prisma.userProject.create({ data: { projectId, userId } });
    await recordAudit({
      action: "CREATE", entity: "UserProject", userId: ctx.id, projectId,
      summary: `Mapped ${user.name} to ${project.name}`,
    });
    revalidatePath(`/projects/${projectId}`);
    return null;
  });
}

export async function removeUserFromProjectAction(
  projectId: string, userId: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.team.remove);
    assertProjectAccess(ctx, projectId);

    const mapping = await prisma.userProject.findFirst({
      where: { projectId, userId },
      include: { user: { select: { name: true } }, project: { select: { name: true, projectManagerId: true } } },
    });
    if (!mapping) throw new Error("That user is not mapped to this project.");
    if (mapping.project.projectManagerId === userId) {
      throw new Error(
        `${mapping.user.name} is the project manager. Change the project manager before removing the mapping.`,
      );
    }

    await prisma.userProject.delete({ where: { id: mapping.id } });
    await recordAudit({
      action: "DELETE", entity: "UserProject", userId: ctx.id, projectId,
      summary: `Removed ${mapping.user.name} from ${mapping.project.name}`,
    });
    revalidatePath(`/projects/${projectId}`);
    return null;
  });
}
