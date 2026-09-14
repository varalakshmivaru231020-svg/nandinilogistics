import type { Prisma, StockTxnType } from "@prisma/client";

/**
 * Stock posting — the single place that writes the stock ledger and moves a
 * balance. Everything that changes stock (GRN, issue, return, transfer,
 * adjustment) goes through here, so valuation can never diverge between the
 * ledger and the balance.
 *
 * Valuation is weighted average:
 *   inward  → newAvg = (oldQty × oldAvg + inQty × inRate) / (oldQty + inQty)
 *   outward → rate is the current average; the average itself does not move.
 *
 * Must be called inside a transaction.
 *
 * No `server-only` guard here on purpose: every function takes its transaction
 * client as an argument and imports only types, so the module is pure enough to
 * unit-test directly (see `pnpm verify:inventory`).
 */
export interface MovementInput {
  itemId: string;
  storeId: string;
  projectId?: string | null;
  txnType: StockTxnType;
  /** Always positive. Direction comes from txnType. */
  quantity: number;
  /** Required for inward movements. Ignored on outward — the average is used. */
  rate?: number;
  refType: string;
  refId: string;
  refNo?: string | null;
  remarks?: string | null;
  createdById?: string | null;
  grnId?: string | null;
  issueId?: string | null;
  txnDate?: Date;
}

// ISSUE_CANCEL puts back what a cancelled issue still had out on site.
const INWARD: StockTxnType[] = ["GRN_IN", "RETURN_IN", "TRANSFER_IN", "ISSUE_CANCEL"];

export function isInward(txnType: StockTxnType): boolean {
  return INWARD.includes(txnType);
}

export class InsufficientStockError extends Error {
  constructor(available: number, requested: number, itemName?: string) {
    super(
      `Only ${available} in stock${itemName ? ` for ${itemName}` : ""}, but ${requested} was requested. ` +
        `Reduce the quantity or receive more first.`,
    );
    this.name = "InsufficientStockError";
  }
}

/**
 * Applies one movement: updates the running balance, recalculates weighted
 * average on inward, and appends an immutable ledger row.
 *
 * `ADJUSTMENT` is the one type that may carry a signed quantity, so a physical
 * stock audit can correct in either direction.
 */
export async function postStockMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput,
): Promise<{ balanceQty: number; rate: number; value: number }> {
  const inward = isInward(input.txnType);
  const isAdjustment = input.txnType === "ADJUSTMENT";

  // Adjustments carry their own sign; everything else is signed by direction.
  const signed = isAdjustment
    ? input.quantity
    : inward
      ? Math.abs(input.quantity)
      : -Math.abs(input.quantity);

  const existing = await tx.stockBalance.findUnique({
    where: { itemId_storeId: { itemId: input.itemId, storeId: input.storeId } },
  });

  const oldQty = existing ? Number(existing.quantity) : 0;
  const oldAvg = existing ? Number(existing.avgRate) : 0;
  const newQty = oldQty + signed;

  if (newQty < 0) {
    throw new InsufficientStockError(oldQty, Math.abs(signed));
  }

  // Only a positive movement carrying its own rate can move the average.
  const movesAverage = signed > 0 && input.rate !== undefined && input.rate > 0;
  const newAvg = movesAverage
    ? newQty === 0
      ? 0
      : (oldQty * oldAvg + signed * input.rate!) / newQty
    : oldAvg;

  // The rate this specific movement is valued at.
  const txnRate = signed > 0 ? (input.rate ?? oldAvg) : oldAvg;

  await tx.stockBalance.upsert({
    where: { itemId_storeId: { itemId: input.itemId, storeId: input.storeId } },
    create: {
      itemId: input.itemId,
      storeId: input.storeId,
      projectId: input.projectId ?? null,
      quantity: newQty,
      avgRate: newAvg,
      value: newQty * newAvg,
    },
    update: {
      quantity: newQty,
      avgRate: newAvg,
      value: newQty * newAvg,
      projectId: input.projectId ?? existing?.projectId ?? null,
    },
  });

  await tx.stockLedger.create({
    data: {
      itemId: input.itemId,
      storeId: input.storeId,
      projectId: input.projectId ?? null,
      txnType: input.txnType,
      txnDate: input.txnDate ?? new Date(),
      quantity: signed,
      rate: txnRate,
      value: Math.abs(signed) * txnRate,
      balanceQty: newQty,
      refType: input.refType,
      refId: input.refId,
      refNo: input.refNo ?? null,
      grnId: input.grnId ?? null,
      issueId: input.issueId ?? null,
      remarks: input.remarks ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return { balanceQty: newQty, rate: txnRate, value: Math.abs(signed) * txnRate };
}

/** On-hand quantity for one item in one store. */
export async function onHand(
  tx: Prisma.TransactionClient,
  itemId: string,
  storeId: string,
): Promise<{ quantity: number; avgRate: number }> {
  const balance = await tx.stockBalance.findUnique({
    where: { itemId_storeId: { itemId, storeId } },
  });
  return {
    quantity: balance ? Number(balance.quantity) : 0,
    avgRate: balance ? Number(balance.avgRate) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Three-way match                                                            */
/* -------------------------------------------------------------------------- */

export interface MatchLine {
  itemId: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  invoicedQty: number;
  poRate: number;
  invoiceRate: number;
}

export interface MatchResult {
  matched: boolean;
  lines: Array<{
    itemName: string;
    qtyVariance: number;
    rateVariance: number;
    issues: string[];
  }>;
  issues: string[];
}

/**
 * Purchase Order ↔ GRN ↔ Invoice.
 *
 * An invoice may never bill for more than was received, nor at a rate above the
 * PO rate. A mismatch is reported, not silently tolerated — the caller decides
 * whether to block or to require the override permission.
 */
export function threeWayMatch(lines: MatchLine[], rateTolerancePct = 0): MatchResult {
  const result: MatchResult = { matched: true, lines: [], issues: [] };

  for (const line of lines) {
    const issues: string[] = [];
    const qtyVariance = line.invoicedQty - line.receivedQty;
    const rateVariance = line.invoiceRate - line.poRate;

    if (qtyVariance > 0) {
      issues.push(
        `Invoiced ${line.invoicedQty} but only ${line.receivedQty} was received and accepted.`,
      );
    }
    if (line.receivedQty > line.orderedQty) {
      issues.push(`Received ${line.receivedQty} against an order of ${line.orderedQty}.`);
    }

    const allowedRate = line.poRate * (1 + rateTolerancePct / 100);
    if (line.invoiceRate > allowedRate) {
      issues.push(
        `Invoiced at ${line.invoiceRate} against a PO rate of ${line.poRate}.`,
      );
    }

    if (issues.length) result.matched = false;
    result.lines.push({ itemName: line.itemName, qtyVariance, rateVariance, issues });
  }

  result.issues = result.lines.flatMap((l) => l.issues.map((i) => `${l.itemName}: ${i}`));
  return result;
}
