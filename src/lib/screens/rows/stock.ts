import "server-only";

import { stockState } from "@/lib/material/list-filters";
import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { qty } from "@/lib/utils";

/**
 * The item-master row, as `src/app/(app)/material/stock/page.tsx` draws one.
 *
 * The screen and the export are **not the same list**: the screen is one row
 * per item, holding the stock it has across every store the filter allows, and
 * the file is one row per store balance. The phone follows the screen, so the
 * JSON mode groups as the screen groups and takes the screen's own stock
 * filter — "Restock now", "Order soon", "Healthy" — which the file has no
 * column for.
 */

export interface StockItemRow {
  id: string;
  code: string;
  name: string;
  uom: string;
  quantity: number;
  reorderLevel: number;
}

/** One row per item, the screen's own grouping and ordering. */
export function stockItemRows(
  balances: Array<{
    itemId: string;
    quantity: unknown;
    item: { code: string; name: string; reorderLevel: unknown; uom: { name: string } };
  }>,
): StockItemRow[] {
  const byItem = new Map<string, StockItemRow>();
  for (const b of balances) {
    const row = byItem.get(b.itemId) ?? {
      id: b.itemId,
      code: b.item.code,
      name: b.item.name,
      uom: b.item.uom.name,
      quantity: 0,
      reorderLevel: Number(b.item.reorderLevel),
    };
    row.quantity += Number(b.quantity);
    byItem.set(b.itemId, row);
  }
  return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The screen's stock filter, which reads the state rather than a column. */
export function stockFilter(items: StockItemRow[], wanted: string | null | undefined): StockItemRow[] {
  if (!wanted) return items;
  return items.filter((i) => {
    const state = stockState(i.quantity, i.reorderLevel);
    return (
      (wanted === "RESTOCK" && state.label === "Restock now") ||
      (wanted === "SOON" && state.label === "Order soon") ||
      (wanted === "HEALTHY" && state.label === "Healthy")
    );
  });
}

export function stockScreenRow(b: StockItemRow): ScreenRow {
  const state = stockState(b.quantity, b.reorderLevel);
  return {
    id: b.id,
    title: b.name,
    meta: b.code,
    lines: [
      { label: "Unit", value: b.uom },
      { label: "Reorder", value: qty(b.reorderLevel, 3) },
    ],
    trailing: { value: qty(b.quantity, 3), label: "Available stock" },
    // The design writes the state in capitals on this screen.
    status: { label: state.label.toUpperCase(), tone: webTone(state.tone) },
  };
}

export function stockEmpty(filtered: boolean) {
  return { title: filtered ? "No stock matches these filters" : "No stock recorded yet" };
}

export const STOCK_NOTE =
  "Available stock updates from GRN receipts and site issues — items below their reorder level " +
  "are flagged for a refill PO. The same records appear under Masters → Item Master.";
