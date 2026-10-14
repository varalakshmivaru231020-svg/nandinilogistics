import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, poListWhere, rangeWords, readPoListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every purchase order matching the screen's filters — not just the page on
 * display — within the caller's project scope. The value column appears only
 * for someone who may see rates, as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.purchaseOrder.view, PERM.material.purchaseOrder.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readPoListParams(gate.params);
  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  const orders = await prisma.purchaseOrder.findMany({
    where: poListWhere(ctx, params),
    orderBy: { poDate: "desc" },
    include: {
      project: { select: { code: true } },
      vendor: { select: { name: true } },
      createdBy: { select: { name: true } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      items: { select: { orderedQty: true, receivedQty: true } },
    },
  });
  const { rows, note } = capRows(orders);

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await projectLabel(params.project),
      rangeWords("PO date", params),
    ],
    "All purchase orders in view",
  );

  const columns: ReportColumn[] = [
    { key: "poNo", header: "PO No" },
    { key: "revision", header: "Revision", align: "right", format: "number" },
    { key: "project", header: "Project" },
    { key: "vendor", header: "Vendor" },
    { key: "poDate", header: "PO date", format: "date" },
    { key: "expectedDate", header: "Expected delivery", format: "date" },
    { key: "lines", header: "Lines", align: "right", format: "number" },
    ...(showRate ? [{ key: "value", header: "Value", align: "right", format: "money" } satisfies ReportColumn] : []),
    { key: "receivedPct", header: "Received", align: "right", format: "percent" },
    { key: "status", header: "Status" },
    { key: "raisedBy", header: "Raised by" },
    { key: "pmApprovedBy", header: "PM approved by" },
    { key: "adminApprovedBy", header: "Admin approved by" },
  ];

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Purchase Orders",
    entity: "PurchaseOrder",
    filters,
    result: {
      columns,
      rows: rows.map((p) => {
        const ordered = p.items.reduce((s, i) => s + Number(i.orderedQty), 0);
        const received = p.items.reduce((s, i) => s + Number(i.receivedQty), 0);
        return {
          id: p.id,
          poNo: p.poNo,
          revision: p.revision,
          project: p.project.code,
          vendor: p.vendor.name,
          poDate: p.poDate,
          expectedDate: p.expectedDate,
          lines: p.items.length,
          ...(showRate ? { value: Number(p.totalAmount) } : {}),
          receivedPct: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
          status: p.status.replace(/_/g, " "),
          raisedBy: p.createdBy.name,
          pmApprovedBy: p.pmApprovedBy?.name ?? "",
          adminApprovedBy: p.adminApprovedBy?.name ?? "",
        };
      }),
      summary: [{ label: "Purchase orders", value: note }],
      emptyMessage: "No purchase orders match these filters.",
    },
  });
}
