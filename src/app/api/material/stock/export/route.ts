import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
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

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Stock",
    entity: "StockBalance",
    filters: filters + (showValuation ? "" : " · Without valuation"),
    result: {
      columns: stockColumns(showValuation),
      rows: rows.map((b) =>
        stockRow(
          {
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
