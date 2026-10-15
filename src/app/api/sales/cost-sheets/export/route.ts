import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { costSheetEmpty, costSheetScreenRow } from "@/lib/screens/rows/sales-rest";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import type { ReportResult } from "@/lib/reports/types";
import { costSheetListWhere, describeCostSheetFilters, readCostSheetListParams } from "@/lib/sales/cost-sheet-list";

export const dynamic = "force-dynamic";

/**
 * Exports the Cost Sheets list — every cost sheet for a unit in the caller's
 * projects matching the screen's search, status and project filters.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.costSheet.view, PERM.sales.costSheet.export);
  if (!gate.ok) return gate.response;
  const { ctx, params: query } = gate;

  const params = readCostSheetListParams(query);
  const now = new Date();

  const found = await prisma.costSheet.findMany({
    where: costSheetListWhere(ctx, params, now),
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      unit: { select: { unitNumber: true, project: { select: { code: true } } } },
      lead: { select: { name: true, leadNo: true } },
      bookings: { select: { bookingNo: true } },
    },
  });
  const { rows, note } = capRows(found);

  /* The screen, for the app: the cost-sheet row, with "expired" beside a date
   * that has passed and whether a discount is approved. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((s) =>
        costSheetScreenRow(
          {
            id: s.id,
            costSheetNo: s.costSheetNo,
            projectCode: s.unit.project.code,
            unitNumber: s.unit.unitNumber,
            leadName: s.lead?.name ?? null,
            createdAt: s.createdAt,
            validUntil: s.validUntil,
            discountAmount: Number(s.discountAmount),
            discountApproved: Boolean(s.discountApprovedAt),
            totalAmount: Number(s.totalAmount),
            bookings: s.bookings.length,
          },
          nowMs,
        ),
      ),
      empty: costSheetEmpty(Boolean(params.q || params.status || params.project)),
    };
  }

  const result: ReportResult = {
    columns: [
      { key: "costSheetNo", header: "Cost sheet No" },
      { key: "project", header: "Project" },
      { key: "unit", header: "Unit" },
      { key: "lead", header: "For" },
      { key: "leadNo", header: "Lead No" },
      { key: "createdAt", header: "Generated on", format: "date" },
      { key: "validUntil", header: "Valid until", format: "date" },
      { key: "baseRate", header: "Base rate", align: "right", format: "money" },
      { key: "subTotal", header: "Sub total", align: "right", format: "money" },
      { key: "discount", header: "Discount", align: "right", format: "money" },
      { key: "discountStatus", header: "Discount status" },
      { key: "tax", header: "Tax", align: "right", format: "money" },
      { key: "total", header: "Total", align: "right", format: "money" },
      { key: "status", header: "Status" },
      { key: "bookings", header: "Booking No" },
    ],
    rows: rows.map((s) => {
      const discount = Number(s.discountAmount);
      const booked = s.bookings.length > 0;
      return {
          id: s.id,
        costSheetNo: s.costSheetNo,
        project: s.unit.project.code,
        unit: s.unit.unitNumber,
        lead: s.lead?.name ?? "",
        leadNo: s.lead?.leadNo ?? "",
        createdAt: s.createdAt,
        validUntil: s.validUntil,
        baseRate: Number(s.baseRate),
        subTotal: Number(s.subTotal),
        discount,
        discountStatus: discount <= 0 ? "" : s.discountApprovedAt ? "Approved" : "Pending",
        tax: Number(s.taxAmount),
        total: Number(s.totalAmount),
        status: booked ? "Booked" : s.validUntil && s.validUntil < now ? "Quoted · expired" : "Quoted",
        bookings: s.bookings.map((b) => b.bookingNo).join(", "),
      };
    }),
    summary: [{ label: "Cost sheets", value: note }],
    emptyMessage: "No cost sheets match these filters.",
  };

  const projectLabel = params.project
    ? (await prisma.project.findFirst({
        where: { id: params.project, ...projectScopeFilter(ctx, "id") },
        select: { code: true },
      }))?.code ?? null
    : null;

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Cost Sheets",
    entity: "CostSheet",
    filters: describeCostSheetFilters(params, projectLabel ? `Project ${projectLabel}` : null),
    result,
    screen,
    projectId: projectLabel ? params.project : null,
  });
}
