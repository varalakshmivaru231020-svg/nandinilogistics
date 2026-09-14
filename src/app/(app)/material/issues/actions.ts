"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { onHand, postStockMovement } from "@/lib/inventory";
import { PERM } from "@/lib/permissions/codes";
import { cancelIssue } from "@/lib/material/issue-cancel";

const IssueSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  storeId: z.string().min(1, "Store is required"),
  workPackageId: z.string().optional(),
  issuedToId: z.string().min(1, "Choose who is receiving the material"),
  purpose: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z
    .array(z.object({ itemId: z.string().min(1), issuedQty: z.coerce.number().positive() }))
    .min(1, "Add at least one item"),
});

type IssueInput = z.infer<typeof IssueSchema>;

/**
 * Issues stock from a store to a supervisor.
 *
 * Consumption is valued at the store's weighted-average rate at the moment of
 * issue, which is what makes "consumption vs indent vs budget" meaningful.
 */
export async function createIssueAction(
  input: IssueInput,
): Promise<ActionResult<{ id: string; issueNo: string; totalValue: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.issue.create);
    const parsed = IssueSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    assertProjectAccess(ctx, v.projectId);

    const result = await prisma.$transaction(async (tx) => {
      // Check availability before writing anything.
      for (const line of v.items) {
        const { quantity } = await onHand(tx, line.itemId, v.storeId);
        if (line.issuedQty > quantity + 0.0001) {
          const item = await tx.item.findUnique({ where: { id: line.itemId }, select: { name: true } });
          throw new Error(
            `Only ${quantity} of ${item?.name ?? "this item"} is in the store, but ${line.issuedQty} was requested.`,
          );
        }
      }

      const issueNo = await nextDocumentNumber(tx, "ISSUE", v.projectId);

      const issue = await tx.materialIssue.create({
        data: {
          issueNo,
          projectId: v.projectId,
          storeId: v.storeId,
          workPackageId: v.workPackageId || null,
          issuedToId: v.issuedToId,
          issuedById: ctx.id,
          purpose: v.purpose || null,
          remarks: v.remarks || null,
        },
      });

      let totalValue = 0;
      for (const line of v.items) {
        const movement = await postStockMovement(tx, {
          itemId: line.itemId,
          storeId: v.storeId,
          projectId: v.projectId,
          txnType: "ISSUE_OUT",
          quantity: line.issuedQty,
          refType: "ISSUE",
          refId: issue.id,
          refNo: issueNo,
          issueId: issue.id,
          createdById: ctx.id,
          remarks: v.purpose ?? null,
        });

        totalValue += movement.value;

        await tx.materialIssueItem.create({
          data: {
            issueId: issue.id,
            itemId: line.itemId,
            issuedQty: line.issuedQty,
            rate: movement.rate,
            value: movement.value,
          },
        });
      }

      await tx.materialIssue.update({ where: { id: issue.id }, data: { totalValue } });
      return { id: issue.id, issueNo, totalValue };
    });

    await recordAudit({
      action: "CREATE",
      entity: "MaterialIssue",
      entityId: result.id,
      userId: ctx.id,
      projectId: v.projectId,
      summary: `Issued ${v.items.length} item line(s) on ${result.issueNo} worth ₹${result.totalValue.toLocaleString("en-IN")}`,
    });

    revalidatePath("/material/issues");
    revalidatePath("/material/stock");
    return result;
  });
}

/** The receiving supervisor signs for what actually reached them. */
export async function acknowledgeIssueAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.issue.acknowledge);

    const issue = await prisma.materialIssue.findUnique({ where: { id } });
    if (!issue) throw new Error("Issue slip not found.");
    assertProjectAccess(ctx, issue.projectId);
    if (issue.cancelledAt) throw new Error("This issue slip is cancelled and cannot be acknowledged.");
    if (issue.acknowledgedAt) throw new Error("This issue slip is already acknowledged.");

    // Only the person it was issued to can sign for it.
    if (issue.issuedToId !== ctx.id && !ctx.isSuperAdmin) {
      throw new Error("Only the person this material was issued to can acknowledge it.");
    }

    // Guarded, so a cancellation landing in between is not signed for.
    const signed = await prisma.materialIssue.updateMany({
      where: { id, cancelledAt: null, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedById: ctx.id },
    });
    if (signed.count === 0) throw new Error("This issue slip was cancelled or acknowledged in the meantime.");

    await recordAudit({
      action: "APPROVE", entity: "MaterialIssue", entityId: id, userId: ctx.id, projectId: issue.projectId,
      summary: `Acknowledged receipt of material on ${issue.issueNo}`,
    });

    revalidatePath("/material/issues");
    return null;
  });
}

/**
 * Cancels an issue slip: stock still out on site goes back into the store at
 * the issue rates. Refused while a return against it awaits a decision.
 */
export async function cancelIssueAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ issueNo: string; valuePutBack: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.issue.cancel);

    const issue = await prisma.materialIssue.findUnique({ where: { id }, select: { projectId: true } });
    if (!issue) throw new Error("Issue slip not found.");
    assertProjectAccess(ctx, issue.projectId);

    const result = await prisma.$transaction((tx) =>
      cancelIssue(tx, { issueId: id, userId: ctx.id, reason: reason ?? "", now: new Date() }),
    );

    await recordAudit({
      action: "CANCEL",
      entity: "MaterialIssue",
      entityId: id,
      userId: ctx.id,
      projectId: result.projectId,
      summary:
        `Cancelled ${result.issueNo}: ${result.linesPutBack} line(s) put back into stock worth ` +
        `₹${result.valuePutBack.toLocaleString("en-IN")} — ${reason.trim()}`,
    });

    revalidatePath("/material/issues");
    revalidatePath("/material/stock");
    revalidatePath("/material/returns");
    return { issueNo: result.issueNo, valuePutBack: result.valuePutBack };
  });
}
