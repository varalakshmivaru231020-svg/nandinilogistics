"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { postGrnToStock } from "@/lib/material/grn-posting";
import { assertUnchanged, staleMessage } from "@/lib/material/procurement";
import { PERM } from "@/lib/permissions/codes";
import {
  assertStorable, filesFrom, labelFrom, storeGrnAttachments,
} from "@/lib/material/grn-attachments";

const GrnLineSchema = z
  .object({
    poItemId: z.string().min(1),
    itemId: z.string().min(1),
    receivedQty: z.coerce.number().min(0),
    acceptedQty: z.coerce.number().min(0),
    rejectedQty: z.coerce.number().min(0).default(0),
    shortQty: z.coerce.number().min(0).default(0),
    rate: z.coerce.number().min(0),
    rejectionReason: z.string().trim().optional(),
  })
  .refine((l) => l.acceptedQty + l.rejectedQty <= l.receivedQty + 0.0001, {
    message: "Accepted plus rejected cannot exceed the quantity received",
  });

const GrnSchema = z.object({
  poId: z.string().min(1, "Purchase order is required"),
  storeId: z.string().min(1, "Receiving store is required"),
  challanNo: z.string().trim().optional(),
  challanDate: z.string().optional(),
  challanPhotoUrl: z.string().trim().optional(),
  vehicleNo: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z.array(GrnLineSchema).min(1, "Record at least one line"),
});

type GrnInput = z.infer<typeof GrnSchema>;

/**
 * Booking a receipt, with the challan that came with it.
 *
 * The paperwork is part of making the receipt, not a correction to one, so it
 * is `grn.create` that governs it here — a storeman who may book a delivery may
 * attach its challan without also being allowed to edit receipts.
 */
export async function createGrnAction(
  input: GrnInput,
  attachments?: FormData,
): Promise<ActionResult<{ id: string; grnNo: string; attached: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.create);
    const parsed = GrnSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: v.poId },
      include: { items: true },
    });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw new Error("Material can only be received against an approved purchase order.");
    }

    // Booking the receipt moves stock, so a file that was never going to be
    // accepted is refused now rather than after the store has been changed.
    const files = attachments ? filesFrom(attachments) : [];
    assertStorable(files);

    // Never accept more than the PO still has outstanding.
    const poItemById = new Map(po.items.map((i) => [i.id, i]));
    for (const line of v.items) {
      const poItem = poItemById.get(line.poItemId);
      if (!poItem) throw new Error("A line does not belong to this purchase order.");
      const outstanding = Number(poItem.orderedQty) - Number(poItem.receivedQty);
      if (line.receivedQty > outstanding + 0.0001) {
        throw new Error(
          `Receiving ${line.receivedQty} exceeds the ${outstanding} still outstanding on this PO line.`,
        );
      }
    }

    // The design has no separate posting step: booking the receipt is what puts
    // the accepted quantity into the store, so both happen in one transaction.
    const grn = await prisma.$transaction(async (tx) => {
      const grnNo = await nextDocumentNumber(tx, "GRN", po.projectId);
      const created = await tx.grn.create({
        data: {
          grnNo,
          poId: po.id,
          vendorId: po.vendorId,
          storeId: v.storeId,
          challanNo: v.challanNo || null,
          challanDate: v.challanDate ? new Date(v.challanDate) : null,
          challanPhotoUrl: v.challanPhotoUrl || null,
          vehicleNo: v.vehicleNo || null,
          receivedById: ctx.id,
          remarks: v.remarks || null,
          status: "DRAFT",
          items: {
            create: v.items
              .filter((l) => l.receivedQty > 0)
              .map((l) => ({
                poItemId: l.poItemId,
                itemId: l.itemId,
                receivedQty: l.receivedQty,
                acceptedQty: l.acceptedQty,
                rejectedQty: l.rejectedQty,
                shortQty: l.shortQty,
                rate: l.rate,
                rejectionReason: l.rejectionReason || null,
              })),
          },
        },
      });
      // A receipt where everything was rejected has nothing to put in the
      // store; it stays on record so the mismatch blocks the invoice.
      if (v.items.some((l) => l.acceptedQty > 0)) await postGrnToStock(tx, created.id, ctx.id);
      return created;
    });

    const attached = files.length
      ? await storeGrnAttachments({
          grnId: grn.id,
          files,
          label: labelFrom(attachments!),
          uploadedById: ctx.id,
        })
      : 0;

    await recordAudit({
      action: "CREATE", entity: "Grn", entityId: grn.id, userId: ctx.id, projectId: po.projectId,
      summary:
        `Recorded goods receipt ${grn.grnNo} against ${po.poNo}` +
        (v.challanNo ? ` (challan ${v.challanNo})` : "") +
        (attached > 0 ? ` with ${attached} attachment(s)` : ""),
    });

    revalidatePath("/material/grn");
    revalidatePath("/material/stock");
    revalidatePath(`/material/purchase-orders/${po.id}`);
    return { id: grn.id, grnNo: grn.grnNo, attached };
  });
}

export async function inspectGrnAction(
  id: string,
  lines: Array<{ lineId: string; acceptedQty: number; rejectedQty: number; rejectionReason?: string }>,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.inspect);

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { items: true, purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") throw new Error("This GRN is already posted to stock and cannot be re-inspected.");
    if (grn.status === "CANCELLED") throw new Error("This GRN is cancelled.");

    const byId = new Map(grn.items.map((i) => [i.id, i]));
    for (const l of lines) {
      const line = byId.get(l.lineId);
      if (!line) throw new Error("A line does not belong to this GRN.");
      const received = Number(line.receivedQty);
      if (l.acceptedQty + l.rejectedQty > received + 0.0001) {
        throw new Error(`Accepted plus rejected cannot exceed the ${received} received on a line.`);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        await tx.grnItem.update({
          where: { id: l.lineId },
          data: {
            acceptedQty: l.acceptedQty,
            rejectedQty: l.rejectedQty,
            rejectionReason: l.rejectionReason || null,
          },
        });
      }
      await tx.grn.update({
        where: { id },
        data: { status: "INSPECTED", inspectedById: ctx.id, inspectedAt: new Date() },
      });
    });

    const rejected = lines.reduce((s, l) => s + l.rejectedQty, 0);
    await recordAudit({
      action: "UPDATE", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Inspected goods receipt ${grn.grnNo}${rejected > 0 ? ` — ${rejected} rejected` : " — all accepted"}`,
    });

    revalidatePath(`/material/grn/${id}`);
    return null;
  });
}

/**
 * Posts the GRN to stock.
 *
 * Only the accepted quantity enters the ledger. Rejected and short quantities
 * stay visible on the receipt but never become stock. Posting also advances the
 * PO's received quantity and status.
 */
export async function postGrnAction(id: string): Promise<ActionResult<{ postedLines: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.post);

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: {
        items: { include: { item: { select: { name: true } } } },
        purchaseOrder: { select: { id: true, poNo: true, projectId: true } },
      },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") throw new Error("This GRN is already posted.");
    if (grn.status === "CANCELLED") throw new Error("A cancelled GRN cannot be posted.");

    const acceptedLines = grn.items.filter((l) => Number(l.acceptedQty) > 0);
    if (acceptedLines.length === 0) {
      throw new Error("Nothing on this receipt was accepted, so there is nothing to post to stock.");
    }

    const result = await prisma.$transaction((tx) => postGrnToStock(tx, id, ctx.id));

    await recordAudit({
      action: "APPROVE",
      entity: "Grn",
      entityId: id,
      userId: ctx.id,
      projectId: grn.purchaseOrder.projectId,
      summary: `Posted goods receipt ${grn.grnNo} to stock — ${result.postedLines} line(s), ${result.totalAccepted} unit(s) accepted; ${grn.purchaseOrder.poNo} is now ${result.poStatus.replace(/_/g, " ").toLowerCase()}`,
    });

    revalidatePath("/material/grn");
    revalidatePath("/material/stock");
    revalidatePath(`/material/grn/${id}`);
    return { postedLines: result.postedLines };
  });
}

export async function cancelGrnAction(id: string, remarks: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.cancel);
    if (!remarks.trim()) throw new Error("A reason is required when cancelling a goods receipt.");

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") {
      throw new Error(
        "This GRN is already in the stock ledger. Post a stock adjustment to correct it — the ledger is never rewritten.",
      );
    }

    await prisma.grn.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      action: "CANCEL", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Cancelled goods receipt ${grn.grnNo}: ${remarks}`,
    });
    revalidatePath("/material/grn");
    revalidatePath(`/material/grn/${id}`);
    return null;
  });
}

/**
 * Deletes a goods receipt, which is what the design's Delete does.
 *
 * A receipt already in the stock ledger is never deleted: the ledger is not
 * rewritten, so correcting it means a stock adjustment instead.
 */
export async function deleteGrnAction(id: string, expectedUpdatedAt?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.delete);
    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { id: true, projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    assertUnchanged(grn.updatedAt, expectedUpdatedAt, grn.grnNo);

    if (grn.status === "POSTED") {
      throw new Error(
        `${grn.grnNo} is already in the stock ledger. Post a stock adjustment to correct it — the ledger is never rewritten.`,
      );
    }

    const { count } = await prisma.grn.deleteMany({ where: { id, updatedAt: grn.updatedAt } });
    if (count === 0) throw new Error(staleMessage(grn.grnNo));

    await recordAudit({
      action: "DELETE", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Deleted goods receipt ${grn.grnNo}`,
    });
    revalidatePath("/material/grn");
    revalidatePath(`/material/purchase-orders/${grn.purchaseOrder.id}`);
    return null;
  });
}

const GrnEditSchema = z.object({
  challanNo: z.string().trim().optional(),
  challanDate: z.string().optional(),
  vehicleNo: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

/**
 * Corrects the paperwork on a goods receipt: the challan, the vehicle and the
 * remarks. Quantities are not editable once the receipt is in the stock
 * ledger, which is every posted receipt — those are corrected with a stock
 * adjustment.
 */
export async function updateGrnAction(
  id: string,
  input: z.infer<typeof GrnEditSchema>,
  expectedUpdatedAt?: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.update);
    const parsed = GrnEditSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    assertUnchanged(grn.updatedAt, expectedUpdatedAt, grn.grnNo);

    const { count } = await prisma.grn.updateMany({
      where: { id, updatedAt: grn.updatedAt },
      data: {
        challanNo: v.challanNo || null,
        challanDate: v.challanDate ? new Date(v.challanDate) : null,
        vehicleNo: v.vehicleNo || null,
        remarks: v.remarks || null,
      },
    });
    if (count === 0) throw new Error(staleMessage(grn.grnNo));

    await recordAudit({
      action: "UPDATE", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Updated the challan details on goods receipt ${grn.grnNo}`,
    });
    revalidatePath("/material/grn");
    revalidatePath(`/material/grn/${id}`);
    return null;
  });
}

/* ------------------------------ Attachments ------------------------------- */

/**
 * The paperwork against a receipt — challans, weighbridge slips, photos.
 *
 * It rarely all arrives with the lorry, so attachments are added when the GRN
 * is made and afterwards, and a wrong one can be taken off again. Editing the
 * GRN is the permission that governs both: whoever may correct a receipt may
 * correct its paperwork.
 */
export async function addGrnAttachmentsAction(
  grnId: string,
  formData: FormData,
): Promise<ActionResult<{ added: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.update);

    const grn = await prisma.grn.findUnique({
      where: { id: grnId },
      select: { id: true, grnNo: true, purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);

    const files = filesFrom(formData);
    if (files.length === 0) throw new Error("Choose at least one file.");

    await storeGrnAttachments({
      grnId, files, label: labelFrom(formData), uploadedById: ctx.id,
    });

    await recordAudit({
      action: "UPDATE", entity: "Grn", entityId: grnId, userId: ctx.id,
      projectId: grn.purchaseOrder.projectId,
      summary: `Attached ${files.length} file(s) to ${grn.grnNo}`,
    });
    revalidatePath(`/material/grn/${grnId}`);
    return { added: files.length };
  });
}

export async function deleteGrnAttachmentAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.update);

    const file = await prisma.grnAttachment.findUnique({
      where: { id },
      select: {
        id: true, fileName: true,
        grn: { select: { id: true, grnNo: true, purchaseOrder: { select: { projectId: true } } } },
      },
    });
    if (!file) throw new Error("That file is no longer there.");
    assertProjectAccess(ctx, file.grn.purchaseOrder.projectId);

    await prisma.grnAttachment.delete({ where: { id } });

    await recordAudit({
      action: "UPDATE", entity: "Grn", entityId: file.grn.id, userId: ctx.id,
      projectId: file.grn.purchaseOrder.projectId,
      summary: `Removed ${file.fileName} from ${file.grn.grnNo}`,
    });
    revalidatePath(`/material/grn/${file.grn.id}`);
    return null;
  });
}
