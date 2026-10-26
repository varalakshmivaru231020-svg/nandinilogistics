import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export class AdvanceError extends Error {}

/** The Team Leaders of the companies a rider is deployed to, by user id. */
export async function teamLeadersOf(tx: Tx, employeeId: string): Promise<string[]> {
  const rows = await tx.companyTeamLeader.findMany({
    where: { company: { riders: { some: { employeeId } } } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** One notice each, to everyone named, except whoever caused it. */
export async function notifyAdvance(
  tx: Tx,
  notice: { kind: "ADVANCE_REQUESTED" | "ADVANCE_DECIDED"; advanceId: string; title: string; body?: string; to: string[]; actorId: string },
): Promise<number> {
  const recipients = [...new Set(notice.to)].filter((id) => id && id !== notice.actorId);
  if (recipients.length === 0) return 0;
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body ?? null,
      href: "/advances",
      entity: "Advance",
      entityId: notice.advanceId,
    })),
  });
  return recipients.length;
}

/**
 * Decides a pending advance. Approval needs a recovery amount per payout, no
 * larger than the advance; the payout posting takes it from there.
 */
export async function decideAdvance(
  tx: Tx,
  advanceId: string,
  decision: "APPROVED" | "REJECTED",
  remarks: string,
  recoveryPerPeriod: number | null,
  decidedById: string,
): Promise<{ employeeId: string; amount: number }> {
  const advance = await tx.advance.findUnique({
    where: { id: advanceId },
    select: { id: true, status: true, amount: true, employeeId: true },
  });
  if (!advance) throw new AdvanceError("That advance request does not exist.");
  if (advance.status !== "PENDING") throw new AdvanceError("This request has already been decided.");

  const amount = Number(advance.amount);
  if (decision === "APPROVED") {
    if (recoveryPerPeriod === null || !Number.isFinite(recoveryPerPeriod) || recoveryPerPeriod <= 0) {
      throw new AdvanceError("Set how much is recovered from each payout.");
    }
    if (recoveryPerPeriod > amount) throw new AdvanceError("The recovery per payout cannot exceed the advance.");
  }
  if (decision === "REJECTED" && !remarks.trim()) throw new AdvanceError("Give a reason for rejecting it.");

  await tx.advance.update({
    where: { id: advanceId },
    data: {
      status: decision,
      decidedById,
      decidedAt: new Date(),
      decisionRemarks: remarks.trim() || null,
      recoveryPerPeriod: decision === "APPROVED" ? recoveryPerPeriod : null,
    },
  });
  return { employeeId: advance.employeeId, amount };
}
