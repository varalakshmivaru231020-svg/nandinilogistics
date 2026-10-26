import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Where each series' numbers actually land, so a number that is already on a
 * row can be stepped over.
 *
 * A counter and the rows it numbers can drift apart: a restore brings back
 * rows without the counter behind them, a hand-entered Rider ID takes a number
 * the counter has not reached. When they drift, the next document takes a
 * number that is already taken and the write dies on a unique constraint.
 * Checking costs one indexed lookup and makes the series self-healing.
 */
const SERIES_ROWS: Record<string, { model: string; field: string }> = {
  LEAD: { model: "lead", field: "leadNo" },
  TASK: { model: "task", field: "taskNo" },
  RIDER: { model: "employee", field: "employeeCode" },
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
 * The number a series produces for a given sequence.
 *
 * Without a fiscal year the prefix runs straight into the digits — "NL001",
 * the SOW's Rider ID. With one, the parts are separated: "LD/2026-27/00001".
 */
export function formatSeriesNumber(
  series: { prefix: string; fiscalYear: string | null; padding: number },
  n: number,
): string {
  const digits = String(n).padStart(series.padding, "0");
  return series.fiscalYear ? `${series.prefix}/${series.fiscalYear}/${digits}` : `${series.prefix}${digits}`;
}

/**
 * Generates the next document number for a series — "NL001", "LD00001".
 *
 * Must be called inside a transaction: the counter is incremented with an
 * atomic update so two simultaneous onboardings can never take the same
 * Rider ID.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  documentKey: string,
): Promise<string> {
  const series = await tx.numberingSeries.findFirst({
    where: { documentKey, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  if (!series) {
    // No series configured — fall back to a timestamped number rather than failing.
    return `${documentKey}-${Date.now().toString(36).toUpperCase()}`;
  }

  const format = (n: number) => formatSeriesNumber(series, n);

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
