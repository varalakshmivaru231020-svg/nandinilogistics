import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { grnFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { grnEmpty, GRN_NOTE, grnScreenRow } from "@/lib/screens/rows/grn";
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

  /*
   * The screen, for the app: the design's own receipt card. The item names and
   * the ordered quantity behind "6.2 of 12 Ton" are read for the window being
   * sent, and the band reads every receipt in scope as the web's does.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const [lines, statRows] = await Promise.all([
      prisma.grn.findMany({
        where: { id: { in: window.map((g) => g.id) } },
        select: {
          id: true, challanPhotoUrl: true,
          items: {
            select: {
              receivedQty: true, acceptedQty: true, rejectedQty: true, shortQty: true,
              poItem: { select: { orderedQty: true } },
              item: { select: { name: true, uom: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.grn.findMany({
        where: grnListWhere(ctx, {
          ...params, q: "", status: null, project: null, from: undefined, to: undefined,
        }),
        select: {
          status: true, grnDate: true,
          items: { select: { acceptedQty: true, rejectedQty: true } },
        },
      }),
    ]);
    const byId = new Map(lines.map((g) => [g.id, g]));
    screen = {
      rows: window.map((g) => {
        const own = byId.get(g.id);
        return grnScreenRow({
          id: g.id,
          grnNo: g.grnNo,
          poNo: g.purchaseOrder.poNo,
          vendor: g.vendor.name,
          grnDate: g.grnDate,
          status: g.status,
          hasChallanPhoto: Boolean(own?.challanPhotoUrl),
          inspectedBy: g.inspectedBy?.name ?? null,
          invoices: g.purchaseOrder._count.invoices,
          items: own?.items ?? [],
        });
      }),
      band: bandOf(
        grnFigures(
          statRows.map((g) => ({ status: g.status, receivedAt: g.grnDate, items: g.items })),
          nowMs,
        ),
      ),
      empty: grnEmpty(
        Boolean(params.q || params.status || params.project || params.from || params.to),
      ),
      note: GRN_NOTE,
    };
  }

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
    screen,
  });
}
