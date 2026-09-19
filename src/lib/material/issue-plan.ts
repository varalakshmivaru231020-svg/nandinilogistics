/**
 * Which store an issue comes out of, and how much it can actually hand over.
 *
 * Material leaves one store. An indent line carries an on-hand figure added up
 * across every store, and showing that on the issue screen told people there
 * were 3 in stock when the store they were issuing from held none — the server
 * then refused the issue for exactly the reason the screen had hidden.
 *
 * Pure, so the choice is tested directly rather than through a form.
 */

export interface StoreRef {
  id: string;
  /** The project this store serves; null for a central one. */
  projectId: string | null;
}

export interface StockRow {
  itemId: string;
  storeId: string;
  available: number;
}

/** What one indent line still needs. */
export interface PendingLine {
  itemId: string;
  pending: number;
}

/** How much of an item a particular store holds. */
export function heldIn(stock: StockRow[], storeId: string, itemId: string): number {
  return stock.find((s) => s.storeId === storeId && s.itemId === itemId)?.available ?? 0;
}

/**
 * The store serving this project, else the central one, else the first there
 * is — but if that store holds none of what is being issued and another store
 * holds some, the one that can actually do it.
 */
export function chooseStore(
  stores: StoreRef[],
  stock: StockRow[],
  projectId: string,
  lines: PendingLine[],
): string {
  const preferred =
    stores.find((s) => s.projectId === projectId)?.id ??
    stores.find((s) => s.projectId === null)?.id ??
    stores[0]?.id ??
    "";
  if (!preferred) return "";

  const covers = (storeId: string) => lines.some((l) => heldIn(stock, storeId, l.itemId) > 0);
  if (covers(preferred)) return preferred;
  return stores.find((s) => covers(s.id))?.id ?? preferred;
}

/**
 * The most a store can issue against a line: what it holds, capped by what the
 * indent still needs. Never the figure from some other store.
 */
export function issuable(stock: StockRow[], storeId: string, line: PendingLine): number {
  return Math.min(heldIn(stock, storeId, line.itemId), line.pending);
}
