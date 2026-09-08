"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const LogSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  logDate: z.string().min(1, "Date is required"),
  title: z.string().trim().min(3, "Give the day's log a title"),
  notes: z.string().trim().optional(),
  manpowerCount: z.coerce.number().int().min(0).default(0),
  weather: z.string().trim().optional(),
  latitude: z.string().trim().optional(),
  longitude: z.string().trim().optional(),
});

export async function createProgressLogAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.progressLog.create);
    const parsed = LogSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    assertProjectAccess(ctx, v.projectId);

    const log = await prisma.siteProgressLog.create({
      data: {
        projectId: v.projectId,
        logDate: new Date(v.logDate),
        title: v.title,
        notes: v.notes || null,
        manpowerCount: v.manpowerCount,
        weather: v.weather || null,
        latitude: v.latitude ? Number(v.latitude) : null,
        longitude: v.longitude ? Number(v.longitude) : null,
        loggedById: ctx.id,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "SiteProgressLog", entityId: log.id, userId: ctx.id,
      projectId: v.projectId,
      summary: `Logged site progress for ${new Date(v.logDate).toLocaleDateString("en-IN")}: ${v.title}`,
    });

    revalidatePath("/projects/progress");
    return { id: log.id };
  });
}

export async function deleteProgressLogAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.progressLog.delete);

    const log = await prisma.siteProgressLog.findUnique({ where: { id } });
    if (!log) throw new Error("Log not found.");
    assertProjectAccess(ctx, log.projectId);

    await prisma.siteProgressLog.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "SiteProgressLog", entityId: id, userId: ctx.id,
      projectId: log.projectId,
      summary: `Deleted the site log "${log.title}"`,
    });

    revalidatePath("/projects/progress");
    return null;
  });
}
