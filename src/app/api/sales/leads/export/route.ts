import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import type { ReportResult } from "@/lib/reports/types";
import { describeLeadFilters, leadListWhere, readLeadListParams } from "@/lib/sales/lead-list";
import { maskPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;

const STAGE_LABEL: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site visit planned",
  VISIT_DONE: "Site visit done", NEGOTIATION: "Negotiation", BOOKED: "Booked", LOST: "Lost",
};

/**
 * Exports the lead list — every lead matching the screen's filters, within the
 * caller's own pipeline unless they may see every lead, with phone numbers
 * masked for anyone who may not see contact details.
 *
 * Headers match the lead import where the values can go back in (Name, Phone,
 * Lead source, Project, Budget from…), so an edited export imports cleanly.
 *
 * It was the one list route that did its own gate and its own file writing,
 * which is why `format=json` did nothing here and the Android client could not
 * read leads at all while every other module worked. It goes through the shared
 * responder now, like the rest.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.lead.view, PERM.sales.lead.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readLeadListParams(gate.params);
  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  const now = new Date();
  const showContact = ctx.has(PERM.sales.lead.viewContact);

  const leads = await prisma.lead.findMany({
    where: leadListWhere(ownership, params, now),
    orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
    take: MAX_ROWS + 1,
    include: {
      source: { select: { name: true } },
      owner: { select: { name: true } },
      project: { select: { code: true } },
      unitType: { select: { name: true } },
      lostReason: { select: { name: true } },
    },
  });
  const { rows: rowsIn, note } = capRows(leads);

  const contact = (phone: string | null) => (phone ? (showContact ? phone : maskPhone(phone)) : "");

  const result: ReportResult = {
    columns: [
      { key: "leadNo", header: "Lead No" },
      { key: "name", header: "Name" },
      { key: "phone", header: "Phone" },
      { key: "altPhone", header: "Alternate phone" },
      { key: "email", header: "Email" },
      { key: "source", header: "Lead source" },
      { key: "project", header: "Project" },
      { key: "unitType", header: "Interested in" },
      { key: "stage", header: "Stage" },
      { key: "owner", header: "Owned by" },
      { key: "requirement", header: "Requirement" },
      { key: "budgetMin", header: "Budget from", align: "right", format: "money" },
      { key: "budgetMax", header: "Budget to", align: "right", format: "money" },
      { key: "nextActionAt", header: "Next action on", format: "date" },
      { key: "createdAt", header: "Captured on", format: "date" },
    ],
    rows: rowsIn.map((l) => ({
        id: l.id,
      leadNo: l.leadNo,
      name: l.name,
      phone: contact(l.phone),
      altPhone: contact(l.altPhone),
      email: showContact ? (l.email ?? "") : l.email ? "(hidden)" : "",
      source: l.source.name,
      project: l.project?.code ?? "",
      unitType: l.unitType?.name ?? "",
      stage: (STAGE_LABEL[l.state] ?? l.state) + (l.lostReason ? ` — ${l.lostReason.name}` : ""),
      owner: l.owner?.name ?? "Unassigned",
      requirement: l.requirement ?? "",
      budgetMin: l.budgetMin === null ? null : Number(l.budgetMin),
      budgetMax: l.budgetMax === null ? null : Number(l.budgetMax),
      nextActionAt: l.nextActionAt,
      createdAt: l.createdAt,
    })),
    summary: [{ label: "Leads", value: note }],
    emptyMessage: "No leads match these filters.",
  };

  let sourceName: string | null = null;
  if (params.source !== "all" && params.source) {
    sourceName = (await prisma.leadSource.findUnique({ where: { id: params.source }, select: { name: true } }))?.name ?? null;
  }

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Leads",
    entity: "Lead",
    filters:
      describeLeadFilters(params, sourceName) +
      (ownership.ownerId ? " · Your pipeline" : "") +
      (showContact ? "" : " · contacts masked"),
    result,
  });
}
