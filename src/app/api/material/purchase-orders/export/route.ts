import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { purchaseOrderFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { poEmpty, PO_NOTE, poScreenRow } from "@/lib/screens/rows/purchase-order";
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

  /*
   * The screen, for the app: the table's own row, the band the web opens with
   * and its empty state. The extra reads — where the PO came from, its first
   * item, the designation under the name — are for the window being sent, not
   * for every PO that matched.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const [extra, statRows] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { id: { in: window.map((p) => p.id) } },
        select: {
          id: true,
          sourceIndent: { select: { indentNo: true } },
          createdBy: { select: { designation: { select: { name: true } } } },
          items: {
            take: 1,
            select: { orderedQty: true, item: { select: { name: true, uom: { select: { name: true } } } } },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.purchaseOrder.findMany({
        where: poListWhere(ctx, {
          ...params, q: "", status: null, project: null, from: undefined, to: undefined,
        }),
        select: {
          status: true, totalAmount: true, expectedDate: true,
          items: { select: { orderedQty: true, receivedQty: true } },
        },
      }),
    ]);
    const byId = new Map(extra.map((e) => [e.id, e]));
    screen = {
      rows: window.map((p) => {
        const e = byId.get(p.id);
        const first = e?.items[0];
        return poScreenRow(
          {
            id: p.id,
            poNo: p.poNo,
            revision: p.revision,
            status: p.status,
            poDate: p.poDate,
            expectedDate: p.expectedDate,
            totalAmount: p.totalAmount,
            vendor: p.vendor.name,
            sourceIndentNo: e?.sourceIndent?.indentNo ?? null,
            raisedBy: p.createdBy.name,
            raisedByDesignation: e?.createdBy.designation?.name ?? null,
            pmApprovedBy: p.pmApprovedBy?.name ?? null,
            adminApprovedBy: p.adminApprovedBy?.name ?? null,
            firstItem: first
              ? { name: first.item.name, orderedQty: first.orderedQty, uom: first.item.uom.name }
              : null,
            lineCount: e?._count.items ?? p.items.length,
          },
          nowMs,
          showRate,
        );
      }),
      band: bandOf(purchaseOrderFigures(statRows, nowMs)),
      empty: poEmpty(
        Boolean(params.q || params.status || params.project || params.from || params.to),
      ),
      note: PO_NOTE,
    };
  }

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
    params: gate.params,
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
    screen,
  });
}
