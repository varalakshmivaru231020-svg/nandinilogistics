import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { IMPORT_EMPTY, importScreenRow } from "@/lib/screens/rows/payout";
import { importBandFigures, importSummaryOf } from "@/lib/payouts/list-display";
import { describeImportFilters, importListWhere, readImportListParams } from "@/lib/payouts/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/** Every payout sheet imported, with its period and how far it got. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.payout.import.view, PERM.payout.import.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readImportListParams(gate.params);
  const [imports, company] = await Promise.all([
    prisma.payoutImport.findMany({
      where: importListWhere(params),
      orderBy: { createdAt: "desc" },
      select: {
        id: true, fileName: true, status: true, periodFrom: true, periodTo: true, createdAt: true, postedAt: true,
        company: { select: { name: true } },
        uploadedBy: { select: { name: true } },
        postedBy: { select: { name: true } },
        lines: { select: { employeeId: true, finalPayout: true } },
      },
    }),
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(imports);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((i) =>
        importScreenRow({
          id: i.id,
          company: i.company.name,
          periodFrom: i.periodFrom,
          periodTo: i.periodTo,
          fileName: i.fileName,
          status: i.status,
          lines: i.lines.length,
          unmatched: i.lines.filter((l) => !l.employeeId).length,
          uploadedBy: i.uploadedBy.name,
        }),
      ),
      band: bandOf(importBandFigures(importSummaryOf(imports))),
      empty: IMPORT_EMPTY,
    };
  }

  const columns: ReportColumn[] = [
    { key: "company", header: "Company" },
    { key: "periodFrom", header: "Period from", format: "date" },
    { key: "periodTo", header: "Period to", format: "date" },
    { key: "fileName", header: "File" },
    { key: "rows", header: "Rows", align: "right", format: "number" },
    { key: "unmatched", header: "Unmatched", align: "right", format: "number" },
    { key: "finalPayout", header: "Final payout", align: "right", format: "money" },
    { key: "status", header: "Status" },
    { key: "uploadedBy", header: "Uploaded by" },
    { key: "createdAt", header: "Uploaded on", format: "date" },
    { key: "postedBy", header: "Posted by" },
    { key: "postedAt", header: "Posted on", format: "date" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Payout sheets",
    entity: "PayoutImport",
    filters: describeImportFilters(params, company?.name ?? null),
    result: {
      columns,
      rows: rows.map((i) => ({
        id: i.id,
        company: i.company.name,
        periodFrom: i.periodFrom,
        periodTo: i.periodTo,
        fileName: i.fileName,
        rows: i.lines.length,
        unmatched: i.lines.filter((l) => !l.employeeId).length,
        finalPayout: i.lines.reduce((s, l) => s + Number(l.finalPayout), 0),
        status: i.status === "POSTED" ? "Posted" : "Draft",
        uploadedBy: i.uploadedBy.name,
        createdAt: i.createdAt,
        postedBy: i.postedBy?.name ?? "",
        postedAt: i.postedAt,
      })),
      summary: [{ label: "Sheets", value: note }],
      emptyMessage: "No payout sheets match these filters.",
    },
  });
}
