"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { bounceReceipt, clearReceipt } from "@/lib/sales/receipt-clearance";
import { parseClearedOn } from "@/lib/sales/receipt-status";

/**
 * Clearance of cheques and DDs. These actions check permission and project
 * access; the state rules and the money live in `receipt-clearance.ts`.
 */

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function revalidate(bookingId: string) {
  revalidatePath("/sales/receipts");
  revalidatePath("/sales/bookings");
  revalidatePath(`/sales/bookings/${bookingId}`);
}

export async function clearReceiptAction(
  id: string,
  clearedOn: string,
): Promise<ActionResult<{ receiptNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.receipt.clear);
    const now = new Date();

    const done = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id },
        include: { booking: { select: { id: true, projectId: true, bookingNo: true } } },
      });
      if (!receipt) throw new Error("Receipt not found.");
      assertProjectAccess(ctx, receipt.booking.projectId);

      const parsed = parseClearedOn(clearedOn, receipt.receiptDate, now);
      if (!parsed.ok) throw new Error(parsed.error);

      await clearReceipt(tx, { receiptId: id, clearedAt: parsed.clearedAt, userId: ctx.id });
      return { receipt, clearedAt: parsed.clearedAt };
    });

    const { receipt } = done;
    await recordAudit({
      action: "UPDATE", entity: "Receipt", entityId: id, userId: ctx.id, projectId: receipt.booking.projectId,
      summary: `Cleared ${receipt.mode} ${receipt.receiptNo} for ${inr(Number(receipt.amount))} against ${receipt.booking.bookingNo} (cleared on ${clearedOn})`,
      changes: { clearedAt: { from: null, to: done.clearedAt.toISOString() } },
    });

    revalidate(receipt.booking.id);
    return { receiptNo: receipt.receiptNo };
  });
}

export async function bounceReceiptAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ receiptNo: string; reversed: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.receipt.clear);

    const done = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id },
        include: {
          booking: { select: { id: true, projectId: true, bookingNo: true, receivedAmount: true } },
          demand: { select: { demandNo: true, receivedAmount: true, status: true } },
        },
      });
      if (!receipt) throw new Error("Receipt not found.");
      assertProjectAccess(ctx, receipt.booking.projectId);

      const result = await bounceReceipt(tx, { receiptId: id, reason, userId: ctx.id, at: new Date() });
      return { receipt, result };
    });

    const { receipt, result } = done;
    const changes: Record<string, { from: unknown; to: unknown }> = {
      bookingReceivedAmount: { from: Number(receipt.booking.receivedAmount), to: result.bookingReceived },
    };
    if (receipt.demand && result.demand) {
      changes.demandReceivedAmount = { from: Number(receipt.demand.receivedAmount), to: result.demand.receivedAmount };
      changes.demandStatus = { from: receipt.demand.status, to: result.demand.status };
    }

    await recordAudit({
      action: "UPDATE", entity: "Receipt", entityId: id, userId: ctx.id, projectId: receipt.booking.projectId,
      summary:
        `Recorded ${receipt.mode} ${receipt.receiptNo} as bounced — ${inr(result.amount)} reversed from ${receipt.booking.bookingNo}` +
        (receipt.demand ? ` and ${receipt.demand.demandNo}` : "") +
        `: ${reason.trim()}`,
      changes,
    });

    revalidate(receipt.booking.id);
    return { receiptNo: receipt.receiptNo, reversed: result.amount };
  });
}
