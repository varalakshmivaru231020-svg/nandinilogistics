import "server-only";

import type { Prisma } from "@prisma/client";

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

  const updated = await tx.numberingSeries.update({
    where: { id: series.id },
    data: { nextNumber: { increment: 1 } },
  });

  const sequence = String(updated.nextNumber - 1).padStart(series.padding, "0");
  return [series.prefix, series.fiscalYear, sequence].filter(Boolean).join("/");
}
