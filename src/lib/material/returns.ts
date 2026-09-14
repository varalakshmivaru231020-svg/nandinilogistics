import type { Prisma } from "@prisma/client";

import { postStockMovement } from "@/lib/inventory";
import { nextDocumentNumber } from "@/lib/numbering";
import type { ProjectScope } from "./list-filters";
import {
  QTY_EPSILON, RETURN_CONDITIONS, roundQty, returnCapError, type CapLine, type ReturnCondition,
} from "./return-caps";

/**
 * Material returns — a site sends unused material back to the store it was
 * issued from.
 *
 *   raise (PENDING) → approve (stock back in, returnedQty advances)
 *                   → reject  (no stock change)
 *   a PENDING return may be deleted by its raiser or a holder of delete.
 *
 * Every state change is claimed with a guarded update on the status it expects,
 * so a concurrent approve and reject cannot both win and stock moves at most
 * once. Quantities are capped here, not only in the action or the form.
 *
 * Damaged material still returns to stock on approval; its condition is kept
 * on the line for the store to act on.
 *
 * Every function takes its transaction client and must run inside a transaction.
 */

type Tx = Prisma.TransactionClient;

export interface RaiseReturnLine {
  issueItemId: string;
  quantity: number;
  condition?: string | null;
  remarks?: string | null;
}

export interface RaiseReturnInput {
  issueId: string;
  userId: string;
  /** The actor's project scope; the issue's project must be in it. */
  scope: ProjectScope;
  reason: string;
  lines: RaiseReturnLine[];
  now: Date;
}

function inScope(scope: ProjectScope, projectId: string): boolean {
  return scope.canAccessAllProjects || scope.projectIds.includes(projectId);
}

function condition(value: string | null | undefined): ReturnCondition {
  if (!value) return "Good";
  const match = RETURN_CONDITIONS.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  if (!match) throw new Error(`Condition must be ${RETURN_CONDITIONS.join(" or ")}.`);
  return match;
}

/**
 * Takes the issue's row lock, refusing a cancelled issue. Raising, approving and
 * cancelling all pass through this lock, so they run one after another against
 * the same issue and each sees what the one before it committed.
 */
async function lockLiveIssue(tx: Tx, issueId: string, now: Date) {
  const locked = await tx.materialIssue.updateMany({
    where: { id: issueId, cancelledAt: null },
    data: { updatedAt: now },
  });
  if (locked.count === 0) {
    const issue = await tx.materialIssue.findUnique({ where: { id: issueId }, select: { issueNo: true } });
    if (!issue) throw new Error("Issue slip not found.");
    throw new Error(`Issue slip ${issue.issueNo} is cancelled, so nothing can be returned against it.`);
  }
}

/** Quantity on PENDING returns, by issue line, for one issue. */
async function pendingByLine(tx: Tx, issueId: string, excludeReturnId?: string): Promise<Map<string, number>> {
  const rows = await tx.materialReturnItem.findMany({
    where: {
      issueItem: { issueId },
      materialReturn: { status: "PENDING", ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}) },
    },
    select: { issueItemId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.issueItemId, roundQty((map.get(r.issueItemId) ?? 0) + Number(r.quantity)));
  return map;
}

export async function raiseReturn(
  tx: Tx,
  input: RaiseReturnInput,
): Promise<{ id: string; returnNo: string; projectId: string; totalValue: number; lines: number }> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for the return.");

  await lockLiveIssue(tx, input.issueId, input.now);

  const issue = await tx.materialIssue.findUniqueOrThrow({
    where: { id: input.issueId },
    select: {
      id: true, issueNo: true, projectId: true, storeId: true,
      items: {
        select: {
          id: true, itemId: true, issuedQty: true, returnedQty: true, rate: true,
          item: { select: { name: true } },
        },
      },
    },
  });
  if (!inScope(input.scope, issue.projectId)) throw new Error("This project is not mapped to you.");

  const pending = await pendingByLine(tx, issue.id);
  const capLines: CapLine[] = issue.items.map((l) => ({
    issueItemId: l.id,
    itemName: l.item.name,
    issuedQty: Number(l.issuedQty),
    returnedQty: Number(l.returnedQty),
    pendingQty: pending.get(l.id) ?? 0,
  }));

  const error = returnCapError(
    capLines,
    input.lines.map((l) => ({ issueItemId: l.issueItemId, quantity: Number(l.quantity) })),
  );
  if (error) throw new Error(error);

  const byId = new Map(issue.items.map((l) => [l.id, l]));
  const lines = input.lines
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => {
      const issueItem = byId.get(l.issueItemId)!;
      const quantity = roundQty(Number(l.quantity));
      const rate = Number(issueItem.rate);
      return {
        issueItemId: issueItem.id,
        itemId: issueItem.itemId,
        quantity,
        rate,
        value: Math.round(quantity * rate * 100) / 100,
        condition: condition(l.condition),
        remarks: l.remarks?.trim() || null,
      };
    });
  const totalValue = lines.reduce((s, l) => s + l.value, 0);

  const returnNo = await nextDocumentNumber(tx, "RETURN", issue.projectId);
  const created = await tx.materialReturn.create({
    data: {
      returnNo,
      projectId: issue.projectId,
      storeId: issue.storeId,
      issueId: issue.id,
      status: "PENDING",
      returnDate: input.now,
      reason,
      raisedById: input.userId,
      totalValue,
      items: { create: lines },
    },
    select: { id: true },
  });

  return { id: created.id, returnNo, projectId: issue.projectId, totalValue, lines: lines.length };
}

export interface DecideReturnInput {
  returnId: string;
  userId: string;
  note?: string | null;
  now: Date;
}

/** Claims a PENDING return for a decision; throws when it is gone or already decided. */
async function claimPending(
  tx: Tx,
  input: DecideReturnInput,
  status: "APPROVED" | "REJECTED",
  note: string | null,
) {
  const claimed = await tx.materialReturn.updateMany({
    where: { id: input.returnId, status: "PENDING" },
    data: { status, decidedById: input.userId, decidedAt: input.now, decisionNote: note },
  });
  if (claimed.count === 0) {
    const existing = await tx.materialReturn.findUnique({
      where: { id: input.returnId },
      select: { returnNo: true, status: true },
    });
    if (!existing) throw new Error("Return not found.");
    throw new Error(`Return ${existing.returnNo} is already ${existing.status.toLowerCase()}.`);
  }
}

export async function approveReturn(
  tx: Tx,
  input: DecideReturnInput,
): Promise<{ returnNo: string; projectId: string; totalValue: number; lines: number }> {
  await claimPending(tx, input, "APPROVED", input.note?.trim() || null);

  const ret = await tx.materialReturn.findUniqueOrThrow({
    where: { id: input.returnId },
    select: {
      id: true, returnNo: true, projectId: true, issueId: true,
      items: { select: { id: true, issueItemId: true, itemId: true, quantity: true } },
    },
  });

  await lockLiveIssue(tx, ret.issueId, input.now);

  const issue = await tx.materialIssue.findUniqueOrThrow({
    where: { id: ret.issueId },
    select: {
      issueNo: true, storeId: true, projectId: true,
      items: {
        select: { id: true, issuedQty: true, returnedQty: true, rate: true, item: { select: { name: true } } },
      },
    },
  });

  // Re-check against what is committed now: this return, plus everything
  // already approved, may never exceed what was issued.
  const capLines: CapLine[] = issue.items.map((l) => ({
    issueItemId: l.id,
    itemName: l.item.name,
    issuedQty: Number(l.issuedQty),
    returnedQty: Number(l.returnedQty),
    pendingQty: 0,
  }));
  const error = returnCapError(
    capLines,
    ret.items.map((l) => ({ issueItemId: l.issueItemId, quantity: Number(l.quantity) })),
  );
  if (error) throw new Error(error);

  const issueLines = new Map(issue.items.map((l) => [l.id, l]));
  let totalValue = 0;

  for (const line of ret.items) {
    const issueItem = issueLines.get(line.issueItemId)!;
    const quantity = roundQty(Number(line.quantity));
    const issued = Number(issueItem.issuedQty);

    // Guarded at the row: returnedQty can never pass issuedQty, whoever calls.
    const advanced = await tx.materialIssueItem.updateMany({
      where: { id: issueItem.id, returnedQty: { lte: roundQty(issued - quantity) + QTY_EPSILON } },
      data: { returnedQty: { increment: quantity } },
    });
    if (advanced.count === 0) {
      throw new Error(`Returning ${quantity} of ${issueItem.item.name} would exceed what was issued.`);
    }

    const rate = Number(issueItem.rate);
    const movement = await postStockMovement(tx, {
      itemId: line.itemId,
      storeId: issue.storeId,
      projectId: issue.projectId,
      txnType: "RETURN_IN",
      quantity,
      rate,
      refType: "RETURN",
      refId: ret.id,
      refNo: ret.returnNo,
      issueId: ret.issueId,
      createdById: input.userId,
      txnDate: input.now,
      remarks: `Returned against ${issue.issueNo}`,
    });
    totalValue += movement.value;

    await tx.materialReturnItem.update({
      where: { id: line.id },
      data: { rate, value: movement.value },
    });
  }

  await tx.materialReturn.update({ where: { id: ret.id }, data: { totalValue } });
  return { returnNo: ret.returnNo, projectId: ret.projectId, totalValue, lines: ret.items.length };
}

export async function rejectReturn(
  tx: Tx,
  input: DecideReturnInput,
): Promise<{ returnNo: string; projectId: string }> {
  const note = input.note?.trim();
  if (!note) throw new Error("Give a reason for rejecting this return.");

  await claimPending(tx, input, "REJECTED", note);
  const ret = await tx.materialReturn.findUniqueOrThrow({
    where: { id: input.returnId },
    select: { returnNo: true, projectId: true },
  });
  return ret;
}

export interface DeleteReturnInput {
  returnId: string;
  userId: string;
  /** Whether the actor holds material.return.delete; otherwise only the raiser may delete. */
  canDeleteAny: boolean;
}

export async function deletePendingReturn(
  tx: Tx,
  input: DeleteReturnInput,
): Promise<{ returnNo: string; projectId: string }> {
  const ret = await tx.materialReturn.findUnique({
    where: { id: input.returnId },
    select: { id: true, returnNo: true, projectId: true, status: true, raisedById: true },
  });
  if (!ret) throw new Error("Return not found.");
  if (ret.status !== "PENDING") {
    throw new Error(`Return ${ret.returnNo} is ${ret.status.toLowerCase()} and can no longer be deleted.`);
  }
  if (!input.canDeleteAny && ret.raisedById !== input.userId) {
    throw new Error("Only the person who raised this return can delete it.");
  }

  // Guarded on PENDING: an approval that landed first keeps its return.
  const deleted = await tx.materialReturn.deleteMany({ where: { id: ret.id, status: "PENDING" } });
  if (deleted.count === 0) throw new Error(`Return ${ret.returnNo} was decided and can no longer be deleted.`);
  return { returnNo: ret.returnNo, projectId: ret.projectId };
}
