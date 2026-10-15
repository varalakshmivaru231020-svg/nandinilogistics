import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { itemFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import {
  stockEmpty, stockFilter, stockItemRows, STOCK_NOTE, stockScreenRow,
} from "@/lib/screens/rows/stock";
import {
  describeParts, readStockListParams, searchWords, stockColumns, stockListWhere, stockRow,
} from "@/lib/material/list-filters";
import { categoryLabel, storeLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import { moneyShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The stock position matching the screen's filters. Rate and value — and the
 * total — are left out entirely for anyone without valuation, as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.stock.view, PERM.material.stock.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readStockListParams(gate.params);
  const showValuation = ctx.has(PERM.material.stock.viewValuation);

  const balances = await prisma.stockBalance.findMany({
    where: stockListWhere(params),
    orderBy: [{ store: { name: "asc" } }, { item: { name: "asc" } }],
    include: {
      item: {
        select: {
          code: true, name: true, reorderLevel: true,
          uom: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
      store: { select: { name: true } },
    },
  });
  const { rows, note } = capRows(balances);

  const filters = describeParts(
    [searchWords(params.q), await storeLabel(params.store), await categoryLabel(params.category)],
    "All stores and categories",
  );

  const totalValue = rows.reduce((s, b) => s + Number(b.value), 0);

  /*
   * The app is sent the **screen**, which is a different list from the file:
   * one row per item holding the stock it has across every store the filter
   * allows, narrowed by the screen's own stock state — "Restock now", "Order
   * soon", "Healthy" — which no column carries. So the JSON mode answers those
   * rows, with the screen's own headers behind them.
   */
  if (gate.format === "json") {
    const items = stockFilter(stockItemRows(balances), params.stock);
    const { from, to } = listWindow(gate.params, items.length);
    const statRows = await prisma.item.findMany({
      where: { status: "ACTIVE" },
      select: { reorderLevel: true, stockBalances: { select: { quantity: true, avgRate: true } } },
    });
    const screen: ScreenShell = {
      rows: items.slice(from, to).map(stockScreenRow),
      band: bandOf(
        itemFigures(
          statRows.map((i) => ({
            reorderLevel: i.reorderLevel,
            balances: i.stockBalances.map((b) => ({ quantity: b.quantity, valuationRate: b.avgRate })),
          })),
        ),
      ),
      empty: stockEmpty(Boolean(params.q || params.store || params.category || params.stock)),
      note: STOCK_NOTE,
    };
    return exportResponse({
      ctx,
      params: gate.params,
      format: gate.format,
      title: "Stock",
      entity: "StockBalance",
      filters: filters + (showValuation ? "" : " · Without valuation"),
      result: {
        columns: [
          { key: "name", header: "Item" },
          { key: "code", header: "Item code" },
          { key: "uom", header: "Unit" },
          { key: "quantity", header: "Available stock", align: "right", format: "qty" },
          { key: "reorderLevel", header: "Reorder", align: "right", format: "qty" },
          { key: "status", header: "Stock status" },
        ],
        rows: items.map((i) => ({
          id: i.id,
          name: i.name,
          code: i.code,
          uom: i.uom,
          quantity: i.quantity,
          reorderLevel: i.reorderLevel,
          status: stockScreenRow(i).status?.label ?? "",
        })),
        summary: [{ label: "Items", value: `${items.length}` }],
        emptyMessage: "No stock matches these filters.",
      },
      screen,
    });
  }

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Stock",
    entity: "StockBalance",
    filters: filters + (showValuation ? "" : " · Without valuation"),
    result: {
      columns: stockColumns(showValuation),
      rows: rows.map((b) =>
        stockRow(
          {
            itemId: b.itemId,
            code: b.item.code,
            name: b.item.name,
            category: b.item.category.name,
            uom: b.item.uom.name,
            store: b.store.name,
            quantity: Number(b.quantity),
            reorderLevel: Number(b.item.reorderLevel),
            avgRate: Number(b.avgRate),
            value: Number(b.value),
          },
          showValuation,
        ),
      ),
      summary: [
        { label: "Stock lines", value: note },
        ...(showValuation ? [{ label: "Value on hand", value: moneyShort(totalValue) }] : []),
      ],
      emptyMessage: "No stock matches these filters.",
    },
  });
}
