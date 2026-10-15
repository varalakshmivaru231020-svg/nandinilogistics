import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { siteVisitEmpty } from "@/lib/sales/site-visit-display";
import { type ScreenShell } from "@/lib/screens/rows";
import { siteVisitDecisions } from "@/lib/records/site-visit";
import { siteVisitScreenRow } from "@/lib/screens/rows/site-visit";
import { PERM } from "@/lib/permissions/codes";
import type { ReportResult } from "@/lib/reports/types";
import { describeSiteVisitFilters, readSiteVisitListParams, siteVisitListWhere } from "@/lib/sales/site-visit-list";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site visit planned",
  VISIT_DONE: "Site visit done", NEGOTIATION: "Negotiation", BOOKED: "Booked", LOST: "Lost",
};

/**
 * Exports the Site Visits list — every visit matching the screen's search,
 * status and visit-date filters, limited to the caller's own visits unless they
 * may see every lead. Lead phones are hidden without `sales.lead.viewContact`,
 * as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.siteVisit.view, PERM.sales.siteVisit.export);
  if (!gate.ok) return gate.response;
  const { ctx, params: query } = gate;

  const params = readSiteVisitListParams(query);
  const now = new Date();
  const canSeeContact = ctx.has(PERM.sales.lead.viewContact);
  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { conductedById: ctx.id };

  const found = await prisma.siteVisit.findMany({
    where: siteVisitListWhere(ownership, params, canSeeContact, now),
    orderBy: [{ visitedAt: "asc" }, { scheduledAt: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: {
      lead: { select: { name: true, leadNo: true, phone: true, state: true, project: { select: { code: true } } } },
      conductedBy: { select: { name: true } },
    },
  });
  const { rows, note } = capRows(found);

  /* The screen, for the app: the scheduled visit with "due" once its moment has
   * passed, and the completed one with its rating and feedback. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((v) =>
        siteVisitScreenRow(
          {
            id: v.id,
            leadName: v.lead.name,
            leadNo: v.lead.leadNo,
            leadPhone: v.lead.phone ?? "",
            conductedByName: v.conductedBy.name,
            scheduledAt: v.scheduledAt,
            visitedAt: v.visitedAt,
            rating: v.rating,
            feedback: v.feedback,
          },
          now.getTime(),
          canSeeContact,
          siteVisitDecisions(
            { id: v.id, visitedAt: v.visitedAt },
            {
              complete: ctx.has(PERM.sales.siteVisit.complete),
              cancel: ctx.has(PERM.sales.siteVisit.cancel),
            },
          ),
        ),
      ),
      empty: siteVisitEmpty(Boolean(params.q || params.status || params.from || params.to)),
    };
  }

  // SiteVisit.projectId has no relation; name the projects it points at.
  const projectIds = [...new Set(rows.map((v) => v.projectId).filter((id): id is string => Boolean(id)))];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true } })
    : [];
  const projectCode = new Map(projects.map((p) => [p.id, p.code]));

  const result: ReportResult = {
    columns: [
      { key: "leadNo", header: "Lead No" },
      { key: "lead", header: "Lead" },
      { key: "phone", header: "Phone" },
      { key: "stage", header: "Lead stage" },
      { key: "project", header: "Project" },
      { key: "conductedBy", header: "Conducted by" },
      { key: "scheduledAt", header: "Scheduled for", format: "date" },
      { key: "visitedAt", header: "Visited on", format: "date" },
      { key: "status", header: "Status" },
      { key: "rating", header: "Rating (out of 5)", align: "right", format: "number" },
      { key: "feedback", header: "Feedback" },
    ],
    rows: rows.map((v) => ({
        id: v.id,
      leadNo: v.lead.leadNo,
      lead: v.lead.name,
      phone: canSeeContact ? v.lead.phone : "(hidden)",
      stage: STAGE_LABEL[v.lead.state] ?? v.lead.state,
      project: (v.projectId ? projectCode.get(v.projectId) : null) ?? v.lead.project?.code ?? "",
      conductedBy: v.conductedBy.name,
      scheduledAt: v.scheduledAt,
      visitedAt: v.visitedAt,
      status: v.visitedAt ? "Completed" : v.scheduledAt < now ? "Scheduled · past due" : "Scheduled",
      rating: v.rating,
      feedback: v.feedback ?? "",
    })),
    summary: [{ label: "Site visits", value: note }],
    emptyMessage: "No site visits match these filters.",
  };

  const filters = describeSiteVisitFilters(params)
    + (ownership.conductedById ? " · Your visits" : "")
    + (canSeeContact ? "" : " · Phones hidden");

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Site Visits",
    entity: "SiteVisit",
    filters,
    result,
    screen,
  });
}
