import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, rangeWords, readTransferListParams, searchWords, transferListWhere,
} from "@/lib/material/list-filters";
import { storeLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/** Every store transfer matching the screen's filters — one row per transfer. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.transfer.view, PERM.material.transfer.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readTransferListParams(gate.params);

  const transfers = await prisma.stockTransfer.findMany({
    where: transferListWhere(params),
    orderBy: { transferDate: "desc" },
    include: {
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
      items: { select: { quantity: true, receivedQty: true } },
    },
  });
  const { rows, note } = capRows(transfers);

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await storeLabel(params.fromStore, "From"),
      await storeLabel(params.toStore, "To"),
      rangeWords("Transferred", params),
    ],
    "All store transfers",
  );

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Store Transfers",
    entity: "StockTransfer",
    filters,
    result: {
      columns: [
        { key: "transferNo", header: "Transfer No" },
        { key: "transferDate", header: "Transferred on", format: "date" },
        { key: "fromStore", header: "From store" },
        { key: "toStore", header: "To store" },
        { key: "lines", header: "Lines", align: "right", format: "number" },
        { key: "sent", header: "Qty sent", align: "right", format: "qty" },
        { key: "received", header: "Qty received", align: "right", format: "qty" },
        { key: "status", header: "Status" },
        { key: "remarks", header: "Remarks" },
      ],
      rows: rows.map((t) => ({
        transferNo: t.transferNo,
        transferDate: t.transferDate,
        fromStore: t.fromStore.name,
        toStore: t.toStore.name,
        lines: t.items.length,
        sent: t.items.reduce((n, i) => n + Number(i.quantity), 0),
        // Received quantities mean something only once the transfer has arrived.
        received: t.status === "RECEIVED" ? t.items.reduce((n, i) => n + Number(i.receivedQty), 0) : null,
        status: t.status.replace(/_/g, " "),
        remarks: t.remarks ?? "",
      })),
      summary: [{ label: "Transfers", value: note }],
      emptyMessage: "No store transfers match these filters.",
    },
  });
}
