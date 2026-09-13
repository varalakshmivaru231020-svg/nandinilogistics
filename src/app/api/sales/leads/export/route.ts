import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { getAuthContext } from "@/lib/rbac/context";
import {
  EXPORT_MIME, exportFileName, isExportFormat, toCsv, toPdf, toXlsx,
} from "@/lib/reports/export";
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
 */
export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.sales.lead.view) || !ctx.has(PERM.sales.lead.export)) {
    return new NextResponse("You do not have permission to export leads.", { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!isExportFormat(format)) return new NextResponse("Choose csv, xlsx or pdf.", { status: 400 });

  const params = readLeadListParams(url.searchParams);
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
  const truncated = leads.length > MAX_ROWS;
  const rowsIn = truncated ? leads.slice(0, MAX_ROWS) : leads;

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
    summary: [
      { label: "Leads", value: rowsIn.length.toLocaleString("en-IN") + (truncated ? ` (first ${MAX_ROWS.toLocaleString("en-IN")})` : "") },
    ],
    emptyMessage: "No leads match these filters.",
  };

  let sourceName: string | null = null;
  if (params.source !== "all" && params.source) {
    sourceName = (await prisma.leadSource.findUnique({ where: { id: params.source }, select: { name: true } }))?.name ?? null;
  }
  const filters = describeLeadFilters(params, sourceName) + (ownership.ownerId ? " · Your pipeline" : "");
  const meta = { title: "Leads", filters, generatedBy: ctx.name, generatedAt: now };

  let body: Buffer;
  try {
    body = format === "csv"
      ? Buffer.from(toCsv(result), "utf-8")
      : format === "xlsx" ? await toXlsx(result, meta) : await toPdf(result, meta);
  } catch (error) {
    console.error(`[leads] ${format} export failed`, error);
    return new NextResponse("The export could not be produced. Try another format.", { status: 500 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: "Lead",
    userId: ctx.id,
    summary: `Exported ${rowsIn.length} leads as ${format.toUpperCase()} (${filters}${showContact ? "" : "; contacts masked"})`,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": EXPORT_MIME[format],
      "Content-Disposition": `attachment; filename="${exportFileName("Leads", format, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
