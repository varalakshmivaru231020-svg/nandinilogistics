import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { ProgressScreen } from "./progress-screen";

export const metadata = { title: "Site Progress" };

export default async function SiteProgressPage() {
  const ctx = await requirePermission(PERM.project.progressLog.view);

  // Without viewAll, a supervisor sees only the logs they wrote.
  const ownership = ctx.has(PERM.project.progressLog.viewAll) ? {} : { loggedById: ctx.id };

  const [logs, projects] = await Promise.all([
    prisma.siteProgressLog.findMany({
      where: { ...projectScopeFilter(ctx), ...ownership },
      orderBy: { logDate: "desc" },
      take: 120,
      include: {
        project: { select: { code: true, name: true } },
        loggedBy: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      where: ctx.canAccessAllProjects ? { status: "ACTIVE" } : { id: { in: ctx.projectIds } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Site Progress"
        description="Geo-tagged, date-stamped record of every day — captured at site, not reconstructed later."
      />

      <ProgressScreen
        logs={logs.map((l) => ({
          id: l.id,
          logDate: l.logDate.toISOString(),
          title: l.title,
          notes: l.notes,
          manpowerCount: l.manpowerCount,
          weather: l.weather,
          latitude: l.latitude === null ? null : Number(l.latitude),
          longitude: l.longitude === null ? null : Number(l.longitude),
          photoCount: Array.isArray(l.photoUrls) ? l.photoUrls.length : 0,
          projectCode: l.project.code,
          projectName: l.project.name,
          loggedByName: l.loggedBy?.name ?? "—",
        }))}
        projects={projects}
        can={{
          create: ctx.has(PERM.project.progressLog.create),
          delete: ctx.has(PERM.project.progressLog.delete),
        }}
      />
    </div>
  );
}
