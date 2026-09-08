import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ScheduleScreen } from "./schedule-screen";

export const metadata = { title: "Project Schedule" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const ctx = await requirePermission(PERM.schedule.activity.view);
  const { project: projectParam } = await searchParams;

  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, code: true,
      phases: { select: { workPackages: { select: { id: true, code: true, name: true } } } },
    },
  });

  const projectId =
    projectParam && projects.some((p) => p.id === projectParam) ? projectParam : projects[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader title="Project Schedule" />
        <Card>
          <EmptyState title="No projects available to you" description="You are not mapped to any project yet." />
        </Card>
      </div>
    );
  }

  const [activities, delayReasons] = await Promise.all([
    prisma.scheduleActivity.findMany({
      where: { projectId },
      orderBy: [{ sequence: "asc" }, { plannedStart: "asc" }],
      include: {
        workPackage: { select: { code: true, name: true } },
        delayReason: { select: { name: true } },
      },
    }),
    prisma.delayReason.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const active = projects.find((p) => p.id === projectId)!;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Project Schedule"
        description="The planned timeline with actual progress rolled up from site. The baseline is retained, so slippage is measurable rather than remembered."
      />

      <ScheduleScreen
        projects={projects.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        activeProjectId={projectId}
        workPackages={active.phases.flatMap((ph) => ph.workPackages)}
        delayReasons={delayReasons}
        activities={activities.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          sequence: a.sequence,
          status: a.status,
          progressPct: a.progressPct,
          isMilestone: a.isMilestone,
          isCriticalPath: a.isCriticalPath,
          baselineStart: a.baselineStart?.toISOString() ?? null,
          baselineEnd: a.baselineEnd?.toISOString() ?? null,
          plannedStart: a.plannedStart?.toISOString() ?? null,
          plannedEnd: a.plannedEnd?.toISOString() ?? null,
          actualStart: a.actualStart?.toISOString() ?? null,
          actualEnd: a.actualEnd?.toISOString() ?? null,
          delayReason: a.delayReason?.name ?? null,
          delayNotes: a.delayNotes,
          workPackage: a.workPackage ? `${a.workPackage.code} — ${a.workPackage.name}` : null,
        }))}
        can={{
          create: ctx.has(PERM.schedule.activity.create),
          updateProgress: ctx.has(PERM.schedule.activity.updateProgress),
          manageDependencies: ctx.has(PERM.schedule.dependency.manage),
          viewGantt: ctx.has(PERM.schedule.gantt.view),
          viewBaseline: ctx.has(PERM.schedule.baseline.view),
          viewCriticalPath: ctx.has(PERM.schedule.criticalPath.view),
        }}
      />
    </div>
  );
}
