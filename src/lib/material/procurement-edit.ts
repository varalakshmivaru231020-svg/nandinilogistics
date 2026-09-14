import type { Prisma } from "@prisma/client";

import {
  indentEditableWhere, indentEstimatedValue, poEditableWhere, poLineChangeProblem, poTotals, priceLine,
} from "./procurement";

type Tx = Prisma.TransactionClient;

/**
 * Raised when the record stopped being editable between the caller's read and
 * this write — an approval landed first. The approval wins; nothing is saved.
 */
export class NoLongerEditableError extends Error {
  constructor(what: string) {
    super(`This ${what} was approved or moved on while you were editing it. Nothing was saved — reopen it to see its current state.`);
    this.name = "NoLongerEditableError";
  }
}

// ---------------------------------------------------------------------------
// Purchase order
// ---------------------------------------------------------------------------

export interface PoEditLine {
  /** Present for a line that already exists on the order. */
  id?: string;
  itemId: string;
  orderedQty: number;
  rate: number;
  discountPct: number;
  taxPct: number;
  specification?: string | null;
}

export interface PoEdit {
  vendorId: string;
  paymentTermId: string | null;
  expectedDate: Date | null;
  deliveryAddress: string | null;
  terms: string | null;
  otherCharges: number;
  items: PoEditLine[];
}

/**
 * Applies an edit to a purchase order that nobody has approved yet.
 *
 * The header write is conditional on the order still being unapproved, so it
 * both claims the row (a concurrent approval waits on the lock) and refuses if
 * an approval committed first. Lines are rewritten afterwards, inside the same
 * transaction, so any refusal rolls the whole edit back. The PO number and
 * status are left exactly as they were.
 */
export async function applyPurchaseOrderEdit(tx: Tx, poId: string, edit: PoEdit) {
  if (edit.items.length === 0) throw new Error("Add at least one item.");
  for (const l of edit.items) {
    if (!(l.orderedQty > 0)) throw new Error("Quantity must be greater than zero.");
    if (l.rate < 0 || l.discountPct < 0 || l.discountPct > 100 || l.taxPct < 0 || l.taxPct > 100) {
      throw new Error("Rate, discount and tax must be within range.");
    }
  }
  if (edit.otherCharges < 0) throw new Error("Other charges cannot be negative.");

  const totals = poTotals(edit.items, edit.otherCharges);

  const claimed = await tx.purchaseOrder.updateMany({
    where: { id: poId, ...poEditableWhere() },
    data: {
      vendorId: edit.vendorId,
      paymentTermId: edit.paymentTermId,
      expectedDate: edit.expectedDate,
      deliveryAddress: edit.deliveryAddress,
      terms: edit.terms,
      otherCharges: edit.otherCharges,
      ...totals,
    },
  });
  if (claimed.count === 0) throw new NoLongerEditableError("purchase order");

  const existing = await tx.purchaseOrderItem.findMany({
    where: { poId },
    include: { _count: { select: { grnItems: true } } },
  });
  const byId = new Map(existing.map((e) => [e.id, e]));

  const kept = new Set<string>();
  for (const l of edit.items) {
    if (!l.id) continue;
    const current = byId.get(l.id);
    if (!current) throw new Error("A line on this edit does not belong to the purchase order.");
    if (kept.has(l.id)) throw new Error("The same order line appears twice.");
    kept.add(l.id);
    const problem = poLineChangeProblem(
      { itemId: current.itemId, receivedQty: Number(current.receivedQty), receiptCount: current._count.grnItems },
      { itemId: l.itemId, orderedQty: l.orderedQty },
    );
    if (problem) throw new Error(`Line ${edit.items.indexOf(l) + 1} ${problem}.`);
  }

  const removed = existing.filter((e) => !kept.has(e.id));
  for (const r of removed) {
    const problem = poLineChangeProblem(
      { itemId: r.itemId, receivedQty: Number(r.receivedQty), receiptCount: r._count.grnItems },
      null,
    );
    if (problem) throw new Error(`A removed line ${problem}.`);
  }
  if (removed.length) {
    await tx.purchaseOrderItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
  }

  for (const l of edit.items) {
    const priced = {
      itemId: l.itemId,
      orderedQty: l.orderedQty,
      rate: l.rate,
      discountPct: l.discountPct,
      taxPct: l.taxPct,
      amount: priceLine(l).total,
      specification: l.specification || null,
    };
    if (l.id) {
      await tx.purchaseOrderItem.update({ where: { id: l.id }, data: priced });
    } else {
      await tx.purchaseOrderItem.create({ data: { ...priced, poId, indentId: null } });
    }
  }

  return { ...totals, lineCount: edit.items.length, removedLines: removed.length };
}

// ---------------------------------------------------------------------------
// Indent
// ---------------------------------------------------------------------------

export interface IndentEditLine {
  id?: string;
  itemId: string;
  requestedQty: number;
  specification?: string | null;
}

export interface IndentEdit {
  workPackageId: string | null;
  requiredByDate: Date;
  purpose: string | null;
  remarks: string | null;
  items: IndentEditLine[];
}

/**
 * Applies an edit to an indent that has no approval step recorded.
 *
 * Rates are resolved here rather than taken from the caller: a line that keeps
 * its item keeps the estimated rate it was raised at; a new or re-itemed line
 * takes the item's standard rate, as the raise form pre-fills it. The value is
 * then recomputed with the same function creation uses.
 */
export async function applyIndentEdit(tx: Tx, indentId: string, edit: IndentEdit) {
  if (edit.items.length === 0) throw new Error("Add at least one item.");
  if (Number.isNaN(edit.requiredByDate.getTime())) throw new Error("Required-by date is not a valid date.");
  for (const l of edit.items) {
    if (!(l.requestedQty > 0)) throw new Error("Quantity must be greater than zero.");
  }

  const claimed = await tx.indent.updateMany({
    where: { id: indentId, ...indentEditableWhere() },
    data: {
      workPackageId: edit.workPackageId,
      requiredByDate: edit.requiredByDate,
      purpose: edit.purpose,
      remarks: edit.remarks,
    },
  });
  if (claimed.count === 0) throw new NoLongerEditableError("indent");

  const indent = await tx.indent.findUniqueOrThrow({
    where: { id: indentId },
    select: { projectId: true, items: true },
  });

  if (edit.workPackageId) {
    const wp = await tx.workPackage.findFirst({
      where: { id: edit.workPackageId, phase: { projectId: indent.projectId } },
      select: { id: true },
    });
    if (!wp) throw new Error("That work package does not belong to this indent's project.");
  }

  const itemIds = [...new Set(edit.items.map((l) => l.itemId))];
  const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, standardRate: true } });
  const standardRate = new Map(items.map((i) => [i.id, Number(i.standardRate)]));
  if (standardRate.size !== itemIds.length) throw new Error("One of the items no longer exists.");

  const byId = new Map(indent.items.map((l) => [l.id, l]));
  const kept = new Set<string>();

  const resolved = edit.items.map((l) => {
    const current = l.id ? byId.get(l.id) : undefined;
    if (l.id && !current) throw new Error("A line on this edit does not belong to the indent.");
    if (l.id) {
      if (kept.has(l.id)) throw new Error("The same indent line appears twice.");
      kept.add(l.id);
    }
    const estimatedRate =
      current && current.itemId === l.itemId ? Number(current.estimatedRate) : standardRate.get(l.itemId)!;
    return { ...l, estimatedRate };
  });

  const removed = indent.items.filter((l) => !kept.has(l.id));
  if (removed.length) {
    await tx.indentItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
  }
  for (const l of resolved) {
    const data = {
      itemId: l.itemId,
      requestedQty: l.requestedQty,
      estimatedRate: l.estimatedRate,
      specification: l.specification || null,
    };
    if (l.id) await tx.indentItem.update({ where: { id: l.id }, data });
    else await tx.indentItem.create({ data: { ...data, indentId } });
  }

  const estimatedValue = indentEstimatedValue(resolved);
  await tx.indent.update({ where: { id: indentId }, data: { estimatedValue } });

  return {
    estimatedValue,
    lines: resolved.map((l) => ({ itemId: l.itemId, requestedQty: l.requestedQty, estimatedRate: l.estimatedRate })),
  };
}
