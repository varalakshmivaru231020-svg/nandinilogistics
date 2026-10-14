import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import { progressLogWhere, readProgressListParams } from "@/lib/projects/list-filters";
import { describeFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

/**
 * Exports the site progress diary — every log matching the screen's project,
 * date range and search, within the caller's project mapping and, without
 * viewAll, only the logs they wrote. The screen shows the latest 120; the
 * export holds every match.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.project.progressLog.view, PERM.project.progressLog.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readProgressListParams(params);
  const ownership = ctx.has(PERM.project.progressLog.viewAll) ? {} : { loggedById: ctx.id };

  const logs = await prisma.siteProgressLog.findMany({
    where: progressLogWhere(ctx, ownership, listParams),
    orderBy: { logDate: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      project: { select: { code: true, name: true } },
      loggedBy: { select: { name: true } },
    },
  });
  const { rows, note } = capRows(logs);

  let projectLabel: string | null = null;
  if (listParams.filters.projectId) {
    const p = await prisma.project.findUnique({
      where: { id: listParams.filters.projectId },
      select: { code: true, name: true },
    });
    projectLabel = p ? `${p.code} — ${p.name}` : "Unknown project";
  }
  const filters = [
    describeFilters(listParams.filters, projectLabel),
    listParams.q ? `Search "${listParams.q}"` : null,
    ownership.loggedById ? "Your logs" : null,
  ].filter(Boolean).join(" · ");

  return exportResponse({
    ...gate,
    title: "Site progress",
    entity: "SiteProgressLog",
    filters,
    projectId: listParams.filters.projectId ?? null,
    result: {
      columns: [
        { key: "logDate", header: "Log date", format: "date" },
        { key: "projectCode", header: "Project code" },
        { key: "project", header: "Project" },
        { key: "title", header: "What happened" },
        { key: "notes", header: "Notes" },
        { key: "manpower", header: "Workers on site", align: "right", format: "number" },
        { key: "weather", header: "Weather" },
        { key: "latitude", header: "Latitude", align: "right" },
        { key: "longitude", header: "Longitude", align: "right" },
        { key: "photos", header: "Photos", align: "right", format: "number" },
        { key: "loggedBy", header: "Logged by" },
      ],
      rows: rows.map((l) => ({
        id: l.id,
        logDate: l.logDate,
        projectCode: l.project.code,
        project: l.project.name,
        title: l.title,
        notes: l.notes ?? "",
        manpower: l.manpowerCount,
        weather: l.weather ?? "",
        latitude: l.latitude === null ? "" : Number(l.latitude).toFixed(5),
        longitude: l.longitude === null ? "" : Number(l.longitude).toFixed(5),
        photos: Array.isArray(l.photoUrls) ? l.photoUrls.length : 0,
        loggedBy: l.loggedBy?.name ?? "",
      })),
      summary: [{ label: "Logs", value: note }],
      emptyMessage: "No site logs match these filters.",
    },
  });
}
