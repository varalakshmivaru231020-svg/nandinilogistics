import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Where each series' numbers actually land, so a number that is already on a
 * row can be stepped over.
 *
 * A counter and the rows it numbers can drift apart: the demo data writes a
 * first cost sheet and booking by hand, an import carries numbers in with it,
 * a restore brings back rows without the counter behind them. When they drift,
 * the next document takes a number that is already taken and the write dies on
 * a unique constraint — the user sees a raw Prisma error and cannot book a
 * flat at all. Checking costs one indexed lookup and makes the series
 * self-healing instead.
 */
const SERIES_ROWS: Record<string, { model: string; field: string }> = {
  INDENT: { model: "indent", field: "indentNo" },
  PO: { model: "purchaseOrder", field: "poNo" },
  GRN: { model: "grn", field: "grnNo" },
  ISSUE: { model: "materialIssue", field: "issueNo" },
  RETURN: { model: "materialReturn", field: "returnNo" },
  TRANSFER: { model: "stockTransfer", field: "transferNo" },
  PAYMENT: { model: "vendorPayment", field: "paymentNo" },
  LEAD: { model: "lead", field: "leadNo" },
  COSTSHEET: { model: "costSheet", field: "costSheetNo" },
  BOOKING: { model: "booking", field: "bookingNo" },
  DEMAND: { model: "paymentDemand", field: "demandNo" },
  RECEIPT: { model: "receipt", field: "receiptNo" },
  CUSTOMER: { model: "customer", field: "customerNo" },
};

/** How far the counter may be wound forward before we stop trying. */
const MAX_SKIP = 200;

async function isTaken(
  tx: Prisma.TransactionClient,
  documentKey: string,
  value: string,
): Promise<boolean> {
  const target = SERIES_ROWS[documentKey];
  if (!target) return false;
  const model = (tx as unknown as Record<string, {
    findFirst(args: unknown): Promise<unknown>;
  }>)[target.model];
  if (!model) return false;
  const row = await model.findFirst({
    where: { [target.field]: value },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Generates the next document number for a series — "IND/NNS/2026-27/0001".
 *
 * Must be called inside a transaction: the counter is incremented with an
 * atomic update so two simultaneous indents can never take the same number.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  documentKey: string,
  projectId: string | null,
): Promise<string> {
  // Prefer a project-specific series, fall back to a platform-wide one.
  let series = await tx.numberingSeries.findFirst({
    where: { documentKey, projectId, status: "ACTIVE" },
  });
  if (!series) {
    series = await tx.numberingSeries.findFirst({
      where: { documentKey, projectId: null, status: "ACTIVE" },
    });
  }

  if (!series) {
    // No series configured — fall back to a timestamped number rather than failing.
    return `${documentKey}-${Date.now().toString(36).toUpperCase()}`;
  }

  const format = (n: number) =>
    [series!.prefix, series!.fiscalYear, String(n).padStart(series!.padding, "0")]
      .filter(Boolean)
      .join("/");

  // Take the counter first, atomically, so two callers never see the same
  // number. Only then step over anything already on a row.
  const updated = await tx.numberingSeries.update({
    where: { id: series.id },
    data: { nextNumber: { increment: 1 } },
  });

  let sequence = updated.nextNumber - 1;
  for (let skipped = 0; skipped < MAX_SKIP; skipped++) {
    const candidate = format(sequence);
    if (!(await isTaken(tx, documentKey, candidate))) {
      // Leave the counter past what was handed out, so the next caller starts
      // from a free number rather than walking the same gap again.
      if (skipped > 0) {
        await tx.numberingSeries.update({
          where: { id: series.id },
          data: { nextNumber: sequence + 1 },
        });
      }
      return candidate;
    }
    sequence++;
  }

  throw new Error(
    `The ${documentKey} numbering series is exhausted — ${MAX_SKIP} numbers from ${format(updated.nextNumber - 1)} are already in use. Check the series under Masters.`,
  );
}
