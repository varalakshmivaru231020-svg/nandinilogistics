import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { projectFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { projectEmpty, projectScreenRow } from "@/lib/screens/rows/exec";
import { PERM } from "@/lib/permissions/codes";
import {
  describeProjectFilters, PROJECT_STATUS_LABEL, projectListWhere, readProjectListParams,
} from "@/lib/projects/list-filters";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Exports the project list — every project matching the screen's search and
 * status filter, within the caller's project mapping. Budget is included only
 * for those who may see it on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.project.project.view, PERM.project.project.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readProjectListParams(params);
  const showBudget = ctx.has(PERM.project.project.viewBudget);

  const projects = await prisma.project.findMany({
    where: projectListWhere(ctx, listParams),
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: {
      projectType: { select: { name: true } },
      company: { select: { name: true } },
      city: { select: { name: true } },
      projectManager: { select: { name: true } },
      activities: { select: { progressPct: true } },
      _count: { select: { units: true, team: true } },
    },
  });
  const { rows, note } = capRows(projects);

  /*
   * The screen, for the app: the table's own row, whose progress is the share
   * of its activities that are complete — the screen's reading, not the
   * activity percentages the file averages — and the band the web opens with.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const [states, statRows] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: window.map((p) => p.id) } },
        select: { id: true, activities: { select: { status: true } } },
      }),
      prisma.project.findMany({
        where: projectListWhere(ctx, {
          ...listParams, q: "", status: "", type: "", city: "", manager: "",
        }),
        select: {
          status: true, targetDate: true, actualEndDate: true,
          _count: { select: { units: true } },
          activities: { select: { status: true } },
        },
      }),
    ]);
    const byId = new Map(states.map((p) => [p.id, p.activities]));
    screen = {
      rows: window.map((p) => {
        const acts = byId.get(p.id) ?? [];
        return projectScreenRow({
          id: p.id,
          name: p.name,
          code: p.code,
          city: p.city?.name ?? null,
          projectType: p.projectType?.name ?? null,
          reraNumber: p.reraNumber,
          totalTowers: p.totalTowers,
          totalFloors: p.totalFloors,
          units: p._count.units,
          projectManager: p.projectManager?.name ?? null,
          status: p.status,
          activitiesDone: acts.filter((a) => a.status === "COMPLETED").length,
          activitiesTotal: acts.length,
        });
      }),
      band: bandOf(
        projectFigures(
          statRows.map((p) => ({
            status: p.status,
            targetDate: p.targetDate,
            actualEndDate: p.actualEndDate,
            units: p._count.units,
            activities: p.activities,
          })),
          nowMs,
        ),
      ),
      empty: projectEmpty(
        Boolean(
          listParams.q || listParams.status || listParams.type || listParams.city ||
            listParams.manager,
        ),
      ),
    };
  }

  const columns: ReportColumn[] = [
    { key: "code", header: "Project code" },
    { key: "name", header: "Project" },
    { key: "type", header: "Project type" },
    { key: "company", header: "Company" },
    { key: "city", header: "City" },
    { key: "rera", header: "RERA number" },
    { key: "status", header: "Status" },
    { key: "manager", header: "Project manager" },
    { key: "towers", header: "Towers", align: "right", format: "number" },
    { key: "floors", header: "Floors", align: "right", format: "number" },
    { key: "units", header: "Units", align: "right", format: "number" },
    { key: "team", header: "Team members", align: "right", format: "number" },
    { key: "progress", header: "Progress", align: "right", format: "percent" },
    { key: "startDate", header: "Start date", format: "date" },
    { key: "targetDate", header: "Target date", format: "date" },
    ...(showBudget ? [{ key: "budget", header: "Budget", align: "right", format: "money" } as ReportColumn] : []),
  ];

  return exportResponse({
    ...gate,
    screen,
    title: "Projects",
    entity: "Project",
    filters: describeProjectFilters(listParams, ctx),
    result: {
      columns,
      rows: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.projectType?.name ?? "",
        company: p.company?.name ?? "",
        city: p.city?.name ?? "",
        rera: p.reraNumber ?? "",
        status: PROJECT_STATUS_LABEL[p.status],
        manager: p.projectManager?.name ?? "Unassigned",
        towers: p.totalTowers,
        floors: p.totalFloors,
        units: p._count.units,
        team: p._count.team,
        progress: p.activities.length
          ? Math.round(p.activities.reduce((s, a) => s + a.progressPct, 0) / p.activities.length)
          : 0,
        startDate: p.startDate,
        targetDate: p.targetDate,
        ...(showBudget ? { budget: Number(p.budgetAmount) } : {}),
      })),
      summary: [{ label: "Projects", value: note }],
      emptyMessage: "No projects match these filters.",
    },
  });
}
