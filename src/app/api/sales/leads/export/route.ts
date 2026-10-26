import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { leadFigures } from "@/lib/metrics/figures";
import { LEAD_EMPTY, LEAD_NOTE } from "@/lib/sales/lead-display";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { leadScreenRow } from "@/lib/screens/rows/lead";
import { PERM } from "@/lib/permissions/codes";
import type { ReportResult } from "@/lib/reports/types";
import { describeLeadFilters, leadListWhere, readLeadListParams } from "@/lib/sales/lead-list";
import { maskPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;

/**
 * Exports the lead list — every lead matching the screen's filters, within the
 * caller's own pipeline unless they may see every lead, with phone numbers
 * masked for anyone who may not see contact details.
 *
 * With `format=json` it is also the list the Android client reads: the same
 * rows as screen rows, the band, and the pipeline's stages as tabs.
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
      stage: { select: { id: true, name: true, kind: true } },
      owner: { select: { name: true } },
      lostReason: { select: { name: true } },
      companies: { select: { company: { select: { name: true } } } },
    },
  });
  const { rows: rowsIn, note } = capRows(leads);

  const contact = (phone: string | null) => (phone ? (showContact ? phone : maskPhone(phone)) : "");

  /*
   * The screen, for the app: the list view's own row and the band, which
   * reads every lead in scope as the web's own query does. The stages are the
   * tabs — the web's columns, which a phone shows one at a time.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = now.getTime();
    const { from, to } = listWindow(gate.params, rowsIn.length);
    const window = rowsIn.slice(from, to);
    const [stages, statRows, byStage] = await Promise.all([
      prisma.leadStage.findMany({
        where: { status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      prisma.lead.findMany({
        where: ownership,
        select: { createdAt: true, stage: { select: { kind: true } } },
      }),
      // What each stage holds under the filters that are set, with the stage
      // itself left out — so the counts on the tabs do not change as you move.
      prisma.lead.groupBy({
        by: ["stageId"],
        where: leadListWhere(ownership, { ...params, stage: "" }, now),
        _count: { _all: true },
      }),
    ]);
    const held = new Map(byStage.map((g) => [g.stageId, g._count._all]));
    screen = {
      rows: window.map((l) =>
        leadScreenRow(
          {
            id: l.id,
            leadNo: l.leadNo,
            name: l.name,
            phone: contact(l.phone),
            stageName: l.stage.name,
            stageKind: l.stage.kind,
            companies: l.companies.map((c) => c.company.name),
            location: l.location,
            ownerName: l.owner?.name ?? null,
            lostReason: l.lostReason?.name ?? null,
            nextActionAt: l.nextActionAt,
            isDuplicate: Boolean(l.duplicateOfId),
          },
          nowMs,
        ),
      ),
      band: bandOf(
        leadFigures(
          statRows.map((l) => ({ stageKind: l.stage.kind, createdAt: l.createdAt })),
          nowMs,
        ),
      ),
      empty: LEAD_EMPTY,
      note: LEAD_NOTE,
      tabs: {
        param: "stage",
        options: [
          { key: "all", label: "All", count: [...held.values()].reduce((a, b) => a + b, 0) },
          ...stages.map((s) => ({ key: s.id, label: s.name, count: held.get(s.id) ?? 0 })),
        ],
      },
    };
  }

  const result: ReportResult = {
    columns: [
      { key: "leadNo", header: "Lead No" },
      { key: "name", header: "Name" },
      { key: "phone", header: "Mobile" },
      { key: "altPhone", header: "Alternate number" },
      { key: "email", header: "Email" },
      { key: "companies", header: "Companies" },
      { key: "location", header: "Location" },
      { key: "stage", header: "Stage" },
      { key: "owner", header: "Tele-caller" },
      { key: "requirement", header: "Notes" },
      { key: "nextActionAt", header: "Next follow-up", format: "date" },
      { key: "createdAt", header: "Captured on", format: "date" },
    ],
    rows: rowsIn.map((l) => ({
      id: l.id,
      leadNo: l.leadNo,
      name: l.name,
      phone: contact(l.phone),
      altPhone: contact(l.altPhone),
      email: showContact ? (l.email ?? "") : l.email ? "(hidden)" : "",
      companies: l.companies.map((c) => c.company.name).join(", "),
      location: l.location ?? "",
      stage: l.stage.name + (l.lostReason ? ` — ${l.lostReason.name}` : ""),
      owner: l.owner?.name ?? "Unassigned",
      requirement: l.requirement ?? "",
      nextActionAt: l.nextActionAt,
      createdAt: l.createdAt,
    })),
    summary: [{ label: "Leads", value: note }],
    emptyMessage: "No leads match these filters.",
  };

  const [stage, company, owner] = await Promise.all([
    params.stage ? prisma.leadStage.findUnique({ where: { id: params.stage }, select: { name: true } }) : null,
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
    params.owner ? prisma.user.findUnique({ where: { id: params.owner }, select: { name: true } }) : null,
  ]);

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Leads",
    entity: "Lead",
    filters:
      describeLeadFilters(params, { stage: stage?.name, company: company?.name, owner: owner?.name }) +
      (ownership.ownerId ? " · Your pipeline" : "") +
      (showContact ? "" : " · contacts masked"),
    result,
  });
}
