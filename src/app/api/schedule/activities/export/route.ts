import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import { activityExportColumns, formatPredecessors } from "@/lib/schedule/activity-import";
import { DAY_MS } from "@/lib/schedule/engine";

export const dynamic = "force-dynamic";

/**
 * Exports one project's activity list — `?project=<id>`, a project mapped to
 * the caller. Headers match the schedule import where the value can go back in
 * (Code, Name, Sequence, Planned start/finish, Duration, Milestone, Predecessors).
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.schedule.activity.view, PERM.schedule.activity.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  /*
   * A schedule is per project — a Gantt across three sites is not a schedule.
   * The workspace header names one, so the Android client gets it from there
   * without having to ask twice; a browser passes it as a query parameter.
   */
  const projectId = params.get("project") || ctx.workspaceProjectId || "";
  if (!projectId) {
    // JSON when the caller is reading a list, so the app can act on the code
    // rather than showing a sentence it cannot interpret.
    return gate.format === "json"
      ? NextResponse.json(
          {
            ok: false,
            error: "Choose a project first — a schedule belongs to one project.",
            code: "project-required",
          },
          { status: 400 },
        )
      : new NextResponse("Choose a project to export.", { status: 400 });
  }
  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(projectId)) {
    return new NextResponse("This project is not mapped to you.", { status: 403 });
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true } });
  if (!project) return new NextResponse("Project not found.", { status: 404 });

  const showBaseline = ctx.has(PERM.schedule.baseline.view);
  const showCritical = ctx.has(PERM.schedule.criticalPath.view);

  const activities = await prisma.scheduleActivity.findMany({
    where: { projectId },
    orderBy: [{ sequence: "asc" }, { plannedStart: "asc" }, { code: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: {
      predecessors: {
        select: { type: true, lagDays: true, predecessor: { select: { code: true } } },
        orderBy: { predecessor: { code: "asc" } },
      },
    },
  });
  const { rows: rowsIn, note } = capRows(activities);

  return exportResponse({
    ...gate,
    title: "Schedule",
    entity: "ScheduleActivity",
    filters: `Project ${project.code} — ${project.name}`,
    projectId,
    result: {
      columns: activityExportColumns({ baseline: showBaseline, criticalPath: showCritical }),
      rows: rowsIn.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        sequence: a.sequence,
        baselineStart: a.baselineStart,
        baselineEnd: a.baselineEnd,
        plannedStart: a.plannedStart,
        plannedEnd: a.plannedEnd,
        durationDays: a.plannedStart && a.plannedEnd
          ? Math.round((a.plannedEnd.getTime() - a.plannedStart.getTime()) / DAY_MS)
          : null,
        actualStart: a.actualStart,
        actualEnd: a.actualEnd,
        progressPct: a.progressPct,
        status: a.status.replace(/_/g, " ").toLowerCase(),
        isMilestone: a.isMilestone ? "Yes" : "No",
        isCriticalPath: a.isCriticalPath ? "Yes" : "No",
        predecessors: formatPredecessors(
          a.predecessors.map((d) => ({ code: d.predecessor.code, type: d.type, lagDays: d.lagDays })),
        ),
      })),
      summary: [{ label: "Activities", value: note }],
      emptyMessage: "This project has no schedule activities.",
    },
  });
}
