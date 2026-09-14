import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import type { ReportResult } from "@/lib/reports/types";
import { describeReceiptFilters, readReceiptListParams, receiptListWhere } from "@/lib/sales/receipt-list";
import { RECEIPT_STATUS_LABEL, receiptStatus } from "@/lib/sales/receipt-status";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Exports the Collection Receipts list — every receipt against a booking in the
 * caller's projects matching the screen's search, mode, status, project and date filters.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.receipt.view, PERM.sales.receipt.export);
  if (!gate.ok) return gate.response;
  const { ctx, params: query } = gate;

  const params = readReceiptListParams(query);

  const found = await prisma.receipt.findMany({
    where: receiptListWhere(ctx, params),
    orderBy: { receiptDate: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      booking: {
        select: {
          bookingNo: true,
          unit: { select: { unitNumber: true } },
          customer: { select: { name: true } },
          project: { select: { code: true } },
        },
      },
      demand: { select: { demandNo: true, milestone: true } },
      bank: { select: { name: true } },
    },
  });
  const { rows, note } = capRows(found);
  // A bounced instrument brought nothing in, as on screen.
  const total = rows.reduce((s, r) => (r.bouncedAt ? s : s + Number(r.amount)), 0);

  const result: ReportResult = {
    columns: [
      { key: "receiptNo", header: "Receipt No" },
      { key: "receiptDate", header: "Received on", format: "date" },
      { key: "project", header: "Project" },
      { key: "unit", header: "Unit" },
      { key: "customer", header: "Customer" },
      { key: "bookingNo", header: "Booking No" },
      { key: "demandNo", header: "Demand No" },
      { key: "milestone", header: "Milestone" },
      { key: "mode", header: "Mode" },
      { key: "referenceNo", header: "Reference" },
      { key: "bank", header: "Bank" },
      { key: "status", header: "Status" },
      { key: "clearedAt", header: "Cleared on", format: "date" },
      { key: "bounceReason", header: "Bounce reason" },
      { key: "amount", header: "Amount", align: "right", format: "money" },
      { key: "remarks", header: "Remarks" },
    ],
    rows: rows.map((r) => ({
      receiptNo: r.receiptNo,
      receiptDate: r.receiptDate,
      project: r.booking.project.code,
      unit: r.booking.unit.unitNumber,
      customer: r.booking.customer.name,
      bookingNo: r.booking.bookingNo,
      demandNo: r.demand?.demandNo ?? "",
      milestone: r.demand?.milestone ?? "",
      mode: r.mode,
      referenceNo: r.referenceNo ?? "",
      bank: r.bank?.name ?? "",
      status: RECEIPT_STATUS_LABEL[receiptStatus(r)],
      clearedAt: r.clearedAt,
      bounceReason: r.bounceReason ?? "",
      amount: Number(r.amount),
      remarks: r.remarks ?? "",
    })),
    summary: [
      { label: "Receipts", value: note },
      { label: "Collected", value: money(total), tone: "good" },
    ],
    emptyMessage: "No receipts match these filters.",
  };

  const projectLabel = params.project
    ? (await prisma.project.findFirst({
        where: { id: params.project, ...projectScopeFilter(ctx, "id") },
        select: { code: true },
      }))?.code ?? null
    : null;

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Collection Receipts",
    entity: "Receipt",
    filters: describeReceiptFilters(params, projectLabel ? `Project ${projectLabel}` : null),
    result,
    projectId: projectLabel ? params.project : null,
  });
}
