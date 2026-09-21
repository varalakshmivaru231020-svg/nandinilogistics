import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { WorkspaceChooser } from "./workspace-chooser";

export const metadata = { title: "Choose a project" };

/**
 * The project chooser, offered once after signing in and reachable again
 * whenever someone wants to change or clear it.
 *
 * Skipping is a real answer: the whole platform works across every project a
 * person can reach, and a workspace only narrows what the screens show.
 */
export default async function WorkspacePage() {
  const ctx = await requireAuth("/workspace");

  const projects = await prisma.project.findMany({
    where: {
      status: { in: ["PLANNING", "ACTIVE"] },
      ...(ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } }),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      addressLine: true,
      status: true,
      projectType: { select: { name: true } },
      city: { select: { name: true } },
      _count: { select: { units: true, activities: true } },
    },
  });

  return (
    <WorkspaceChooser
      current={ctx.workspaceProjectId}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        type: p.projectType.name,
        where: [p.addressLine, p.city?.name].filter(Boolean).join(", ") || "—",
        status: p.status,
        units: p._count.units,
        activities: p._count.activities,
      }))}
    />
  );
}
