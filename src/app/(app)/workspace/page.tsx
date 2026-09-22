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
      id: true, name: true, code: true, addressLine: true, status: true,
      reraNumber: true, totalTowers: true, totalFloors: true,
      projectType: { select: { name: true } },
      city: { select: { name: true } },
      projectManager: { select: { name: true } },
      activities: { select: { status: true } },
      _count: { select: { units: true } },
    },
  });

  return (
    <WorkspaceChooser
      current={ctx.workspaceProjectId}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        where: p.city?.name ?? p.addressLine ?? "—",
        type: p.projectType.name,
        rera: p.reraNumber ?? "RERA not recorded",
        // The design's scale column, written the way it writes it.
        scale: [
          p.totalTowers > 0 && `${p.totalTowers} tower${p.totalTowers === 1 ? "" : "s"}`,
          p.totalFloors > 0 && `${p.totalFloors} fl`,
          `${p._count.units} units`,
        ].filter(Boolean).join(" · "),
        manager: p.projectManager?.name ?? null,
        // How much of the plan is closed — the same measure the projects list uses.
        progressPct: p.activities.length
          ? Math.round(
              (p.activities.filter((a) => a.status === "COMPLETED").length / p.activities.length) * 100,
            )
          : 0,
        status: p.status,
      }))}
    />
  );
}
