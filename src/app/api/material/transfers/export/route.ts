import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { transferEmpty } from "@/lib/material/transfer-display";
import { transferDecisions } from "@/lib/records/transfer";
import { transferScreenRow } from "@/lib/screens/rows/material-rest";
import {
  describeParts, enumWords, rangeWords, readTransferListParams, searchWords, transferListWhere,
} from "@/lib/material/list-filters";
import { storeLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import { qty } from "@/lib/utils";

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

  /* The screen, for the app: the transfer row the web draws. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    // The lines a receipt needs, read for the window the row buttons are on.
    const lines = await prisma.stockTransfer.findMany({
      where: { id: { in: window.map((t) => t.id) } },
      select: {
        id: true,
        items: {
          select: {
            id: true, quantity: true,
            item: { select: { name: true, uom: { select: { name: true } } } },
          },
        },
      },
    });
    const byId = new Map(lines.map((t) => [t.id, t.items]));
    const can = {
      approve: ctx.has(PERM.material.transfer.approve),
      receive: ctx.has(PERM.material.transfer.receive),
    };
    screen = {
      rows: window.map((t) =>
        transferScreenRow(
          {
            id: t.id,
            transferNo: t.transferNo,
            status: t.status,
            fromStoreName: t.fromStore.name,
            toStoreName: t.toStore.name,
            transferDate: t.transferDate,
            lineCount: t.items.length,
          },
          transferDecisions(
            {
              id: t.id,
              status: t.status,
              fromStore: t.fromStore.name,
              toStore: t.toStore.name,
              lines: (byId.get(t.id) ?? []).map((l) => ({
                id: l.id,
                label: `${l.item.name} · ${qty(Number(l.quantity), 3)} ${l.item.uom.name} sent`,
                sent: Number(l.quantity),
              })),
            },
            can,
          ),
        ),
      ),
      empty: transferEmpty(
        Boolean(params.q || params.status || params.fromStore || params.toStore || params.from || params.to),
      ),
    };
  }

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
    params: gate.params,
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
        id: t.id,
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
    screen,
  });
}
