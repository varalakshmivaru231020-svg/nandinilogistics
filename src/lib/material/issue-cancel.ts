import type { Prisma } from "@prisma/client";

import { postStockMovement } from "@/lib/inventory";
import { unreturnedQty } from "./return-caps";

/**
 * Cancelling a material issue: whatever is still out on site against it goes
 * back into the store it left, at the rate it left at — so the balance and the
 * weighted average return to where they would have been.
 *
 * Extracted from the server action so the invariants hold for every caller and
 * can be tested without a request context. The action keeps permission and
 * project checks; this keeps the state rules and the arithmetic.
 *
 * Must be called inside a transaction.
 */
export interface CancelIssueInput {
  issueId: string;
  userId: string | null;
  reason: string;
  now: Date;
}

export interface CancelIssueResult {
  issueNo: string;
  projectId: string;
  /** Lines that put stock back (lines already fully returned are skipped). */
  linesPutBack: number;
  /** Value of what went back into the store, at the issue rates. */
  valuePutBack: number;
}

export async function cancelIssue(
  tx: Prisma.TransactionClient,
  input: CancelIssueInput,
): Promise<CancelIssueResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for cancelling this issue slip.");

  const issue = await tx.materialIssue.findUnique({
    where: { id: input.issueId },
    select: { id: true, issueNo: true, projectId: true, storeId: true, cancelledAt: true },
  });
  if (!issue) throw new Error("Issue slip not found.");
  if (issue.cancelledAt) throw new Error(`Issue slip ${issue.issueNo} is already cancelled.`);

  // Claim the cancellation before any stock moves. The guarded update also
  // takes the row lock, so a double click — or a return being raised at the
  // same moment — queues behind this transaction and then sees its outcome.
  const claimed = await tx.materialIssue.updateMany({
    where: { id: issue.id, cancelledAt: null },
    data: { cancelledAt: input.now, cancelledById: input.userId, cancelReason: reason },
  });
  if (claimed.count === 0) throw new Error(`Issue slip ${issue.issueNo} is already cancelled.`);

  // Read after the claim, so a return committed while we waited is seen.
  const pending = await tx.materialReturn.count({ where: { issueId: issue.id, status: "PENDING" } });
  if (pending > 0) {
    throw new Error(
      `${issue.issueNo} has ${pending} return(s) awaiting a decision. Approve or reject them before cancelling the issue.`,
    );
  }

  const items = await tx.materialIssueItem.findMany({
    where: { issueId: issue.id },
    select: { itemId: true, issuedQty: true, returnedQty: true, rate: true },
  });

  let linesPutBack = 0;
  let valuePutBack = 0;
  for (const line of items) {
    const quantity = unreturnedQty(Number(line.issuedQty), Number(line.returnedQty));
    if (quantity <= 0) continue;

    const movement = await postStockMovement(tx, {
      itemId: line.itemId,
      storeId: issue.storeId,
      projectId: issue.projectId,
      txnType: "ISSUE_CANCEL",
      quantity,
      rate: Number(line.rate),
      refType: "ISSUE_CANCEL",
      refId: issue.id,
      refNo: issue.issueNo,
      issueId: issue.id,
      createdById: input.userId,
      txnDate: input.now,
      remarks: `Issue cancelled: ${reason}`,
    });
    linesPutBack += 1;
    valuePutBack += movement.value;
  }

  return { issueNo: issue.issueNo, projectId: issue.projectId, linesPutBack, valuePutBack };
}
