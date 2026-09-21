"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireAuth, runAction, type ActionResult } from "@/lib/rbac/guard";
import { writeWorkspaceCookie } from "@/lib/workspace";

/**
 * Chooses the project to work in, or clears it back to all projects.
 *
 * Only a project the person may reach can be chosen — the cookie is theirs to
 * edit, so the check is here rather than only on the screen that offers it.
 */
export async function setWorkspaceAction(projectId: string | null): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireAuth();

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) throw new Error("That project no longer exists.");
      if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(projectId)) {
        throw new Error("You are not mapped to that project.");
      }
    }

    await writeWorkspaceCookie(projectId);
    // Every screen reads the workspace, so nothing cached survives the change.
    revalidatePath("/", "layout");
    return null;
  });
}
