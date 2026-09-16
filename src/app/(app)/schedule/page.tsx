import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ScheduleScreen } from "./schedule-screen";

export const metadata = { title: "Project Schedule" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tab?: string; report?: string }>;
}) {
  const ctx = await requirePermission(PERM.schedule.activity.view);
  const { project: projectParam, tab = "plan", report = "plan" } = await searchParams;

  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, code: true,
      projectManager: { select: { name: true } },
      phases: {
        orderBy: { sequence: "asc" },
        select: { id: true, code: true, name: true, workPackages: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  const projectId =
    projectParam && projects.some((p) => p.id === projectParam) ? projectParam : projects[0]?.id;

  if (!projectId) {
    return (
      <div>
        <PageHeader title="Project Schedule" />
        <Card>
          <EmptyState title="No projects available to you" description="You are not mapped to any project yet." />
        </Card>
      </div>
    );
  }

  const [activities, delayReasons, extensions] = await Promise.all([
    prisma.scheduleActivity.findMany({
      where: { projectId },
      orderBy: [{ sequence: "asc" }, { plannedStart: "asc" }],
      include: {
        workPackage: { select: { id: true, code: true, name: true, phase: { select: { id: true, name: true } } } },
        delayReason: { select: { name: true } },
        predecessors: {
          select: {
            id: true, predecessorId: true, type: true, lagDays: true,
            predecessor: { select: { code: true, name: true } },
          },
        },
        extensions: {
          orderBy: { requestedAt: "desc" },
          include: {
            requestedBy: { select: { name: true } },
            decidedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.delayReason.findMany({
      where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    ctx.has(PERM.schedule.extension.view)
      ? prisma.scheduleExtension.findMany({
          where: { activity: { projectId } },
          orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
          include: {
            activity: { select: { code: true, name: true, plannedEnd: true, baselineEnd: true } },
            requestedBy: { select: { name: true } },
            decidedBy: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const active = projects.find((p) => p.id === projectId)!;

  return (
    <ScheduleScreen
      projects={projects.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
      activeProjectId={projectId}
      projectManager={active.projectManager?.name ?? null}
      tab={tab === "extensions" ? "extensions" : tab === "reports" ? "reports" : "plan"}
      reportTab={report === "performance" ? "performance" : "plan"}
      nowMs={new Date().getTime()}
      workPackages={active.phases.flatMap((ph) =>
        ph.workPackages.map((w) => ({ id: w.id, code: w.code, name: w.name, phase: ph.name })),
      )}
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
        groupId: a.workPackage?.id ?? "unassigned",
        groupName: a.workPackage ? `${a.workPackage.code} — ${a.workPackage.name}` : "Unassigned activities",
        phaseName: a.workPackage?.phase.name ?? null,
        pendingExtension: a.extensions.some((e) => e.status === "PENDING"),
        predecessors: a.predecessors.map((d) => ({
          id: d.id, predecessorId: d.predecessorId, type: d.type, lagDays: d.lagDays,
          code: d.predecessor.code, name: d.predecessor.name,
        })),
      }))}
      extensions={extensions.map((e) => ({
        id: e.id,
        activityCode: e.activity.code,
        activityName: e.activity.name,
        currentDate: (e.activity.plannedEnd ?? e.activity.baselineEnd)?.toISOString() ?? null,
        requestedDays: e.requestedDays,
        requestedDate: e.requestedDate.toISOString(),
        reason: e.reason,
        status: e.status,
        requestedBy: e.requestedBy.name,
        requestedAt: e.requestedAt.toISOString(),
        decidedBy: e.decidedBy?.name ?? null,
        decidedAt: e.decidedAt?.toISOString() ?? null,
        decisionNote: e.decisionNote,
      }))}
      can={{
        create: ctx.has(PERM.schedule.activity.create),
        importActivities: ctx.has(PERM.schedule.activity.import),
        exportActivities: ctx.has(PERM.schedule.activity.export),
        updateProgress: ctx.has(PERM.schedule.activity.updateProgress),
        manageDependencies: ctx.has(PERM.schedule.dependency.manage),
        viewBaseline: ctx.has(PERM.schedule.baseline.view),
        viewCriticalPath: ctx.has(PERM.schedule.criticalPath.view),
        viewExtensions: ctx.has(PERM.schedule.extension.view),
        requestExtension: ctx.has(PERM.schedule.extension.request),
        approveExtension: ctx.has(PERM.schedule.extension.approve),
        viewReports: ctx.has(PERM.schedule.report.view),
        startActivity: ctx.has(PERM.schedule.activity.start),
        completeActivity: ctx.has(PERM.schedule.activity.complete),
        saveTemplate: ctx.has(PERM.schedule.template.save),
        applyTemplate: ctx.has(PERM.schedule.template.apply),
        deleteTemplate: ctx.has(PERM.schedule.template.delete),
      }}
    />
  );
}
