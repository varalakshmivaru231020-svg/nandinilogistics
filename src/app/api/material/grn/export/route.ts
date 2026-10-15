import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, grnListWhere, grnMatch, rangeWords, readGrnListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/** Every goods receipt matching the screen's filters, within the caller's project scope. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.grn.view, PERM.material.grn.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readGrnListParams(gate.params);

  const grns = await prisma.grn.findMany({
    where: grnListWhere(ctx, params),
    orderBy: { grnDate: "desc" },
    include: {
      store: { select: { name: true } },
      vendor: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      purchaseOrder: {
        select: { poNo: true, project: { select: { code: true } }, _count: { select: { invoices: true } } },
      },
      items: { select: { acceptedQty: true, rejectedQty: true, shortQty: true } },
    },
  });
  const { rows, note } = capRows(grns);

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await projectLabel(params.project),
      rangeWords("Received", params),
    ],
    "All goods receipts in view",
  );

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Goods Receipts",
    entity: "Grn",
    filters,
    result: {
      columns: [
        { key: "grnNo", header: "GRN No" },
        { key: "poNo", header: "PO No" },
        { key: "project", header: "Project" },
        { key: "vendor", header: "Vendor" },
        { key: "store", header: "Store" },
        { key: "grnDate", header: "Received on", format: "date" },
        { key: "challanNo", header: "Challan No" },
        { key: "lines", header: "Lines", align: "right", format: "number" },
        { key: "accepted", header: "Accepted qty", align: "right", format: "qty" },
        { key: "rejected", header: "Rejected qty", align: "right", format: "qty" },
        { key: "short", header: "Short qty", align: "right", format: "qty" },
        { key: "inspectedBy", header: "Inspected by" },
        { key: "status", header: "Status" },
        { key: "match", header: "Three-way match" },
      ],
      rows: rows.map((g) => {
        const accepted = g.items.reduce((n, i) => n + Number(i.acceptedQty), 0);
        const rejected = g.items.reduce((n, i) => n + Number(i.rejectedQty), 0);
        const short = g.items.reduce((n, i) => n + Number(i.shortQty), 0);
        return {
          id: g.id,
          grnNo: g.grnNo,
          poNo: g.purchaseOrder.poNo,
          project: g.purchaseOrder.project.code,
          vendor: g.vendor.name,
          store: g.store.name,
          grnDate: g.grnDate,
          challanNo: g.challanNo ?? "",
          lines: g.items.length,
          accepted, rejected, short,
          inspectedBy: g.inspectedBy?.name ?? "",
          status: g.status.replace(/_/g, " "),
          match: grnMatch(g.status, rejected, short, g.purchaseOrder._count.invoices).label,
        };
      }),
      summary: [{ label: "Goods receipts", value: note }],
      emptyMessage: "No goods receipts match these filters.",
    },
  });
}
