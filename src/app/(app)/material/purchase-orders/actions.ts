"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  authorize, runAction, assertProjectAccess, assertWithinApprovalLimit,
  type ActionResult,
} from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";

const APPROVAL_SCOPE = "material.po";

const LineSchema = z.object({
  itemId: z.string().min(1),
  indentId: z.string().optional(),
  orderedQty: z.coerce.number().positive("Quantity must be greater than zero"),
  rate: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxPct: z.coerce.number().min(0).max(100).default(0),
  specification: z.string().trim().optional(),
});

const PoSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  vendorId: z.string().min(1, "Vendor is required"),
  paymentTermId: z.string().optional(),
  expectedDate: z.string().optional(),
  deliveryAddress: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  otherCharges: z.coerce.number().min(0).default(0),
  items: z.array(LineSchema).min(1, "Add at least one item"),
});

type PoInput = z.infer<typeof PoSchema>;

/** Line amount after discount, and the tax it attracts. */
function priceLine(line: { orderedQty: number; rate: number; discountPct: number; taxPct: number }) {
  const gross = line.orderedQty * line.rate;
  const net = gross - (gross * line.discountPct) / 100;
  const tax = (net * line.taxPct) / 100;
  return { net, tax };
}

function totals(items: PoInput["items"], otherCharges: number) {
  let subTotal = 0;
  let taxAmount = 0;
  for (const l of items) {
    const { net, tax } = priceLine(l);
    subTotal += net;
    taxAmount += tax;
  }
  return { subTotal, taxAmount, totalAmount: subTotal + taxAmount + otherCharges };
}

export async function createPurchaseOrderAction(
  input: PoInput,
  submitForApproval: boolean,
): Promise<ActionResult<{ id: string; poNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.create);
    const parsed = PoSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const v = parsed.data;
    assertProjectAccess(ctx, v.projectId);

    const { subTotal, taxAmount, totalAmount } = totals(v.items, v.otherCharges);

    const po = await prisma.$transaction(async (tx) => {
      const poNo = await nextDocumentNumber(tx, "PO", v.projectId);
      return tx.purchaseOrder.create({
        data: {
          poNo,
          projectId: v.projectId,
          vendorId: v.vendorId,
          paymentTermId: v.paymentTermId || null,
          expectedDate: v.expectedDate ? new Date(v.expectedDate) : null,
          deliveryAddress: v.deliveryAddress || null,
          terms: v.terms || null,
          createdById: ctx.id,
          subTotal,
          taxAmount,
          otherCharges: v.otherCharges,
          totalAmount,
          status: submitForApproval ? "PENDING_APPROVAL" : "DRAFT",
          items: {
            create: v.items.map((l) => {
              const { net, tax } = priceLine(l);
              return {
                itemId: l.itemId,
                indentId: l.indentId || null,
                orderedQty: l.orderedQty,
                rate: l.rate,
                discountPct: l.discountPct,
                taxPct: l.taxPct,
                amount: net + tax,
                specification: l.specification || null,
              };
            }),
          },
        },
      });
    });

    await recordAudit({
      action: submitForApproval ? "SUBMIT" : "CREATE",
      entity: "PurchaseOrder",
      entityId: po.id,
      userId: ctx.id,
      projectId: v.projectId,
      summary: `${submitForApproval ? "Raised" : "Drafted"} purchase order ${po.poNo} for ₹${totalAmount.toLocaleString("en-IN")} (${v.items.length} line(s))`,
    });

    revalidatePath("/material/purchase-orders");
    return { id: po.id, poNo: po.poNo };
  });
}

export async function approvePurchaseOrderAction(
  id: string,
  remarks: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.approve);

    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (!["DRAFT", "PENDING_APPROVAL"].includes(po.status)) {
      throw new Error(`This PO is ${po.status.replace(/_/g, " ").toLowerCase()} and cannot be approved again.`);
    }

    // Value-based routing: an approver may not exceed their configured ceiling.
    assertWithinApprovalLimit(ctx, APPROVAL_SCOPE, Number(po.totalAmount));

    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: "APPROVED", approvedById: ctx.id, approvedAt: new Date() },
    });

    // Mark the source indents as ordered once a PO covers them.
    const linkedIndentIds = (
      await prisma.purchaseOrderItem.findMany({
        where: { poId: id, indentId: { not: null } },
        select: { indentId: true },
        distinct: ["indentId"],
      })
    )
      .map((r) => r.indentId)
      .filter((v): v is string => Boolean(v));

    if (linkedIndentIds.length) {
      await prisma.indent.updateMany({
        where: { id: { in: linkedIndentIds }, status: "ADMIN_APPROVED" },
        data: { status: "ORDERED" },
      });
    }

    await recordAudit({
      action: "APPROVE",
      entity: "PurchaseOrder",
      entityId: id,
      userId: ctx.id,
      projectId: po.projectId,
      summary: `Approved purchase order ${po.poNo} for ₹${Number(po.totalAmount).toLocaleString("en-IN")}${remarks ? ` — ${remarks}` : ""}`,
    });

    revalidatePath("/material/purchase-orders");
    revalidatePath(`/material/purchase-orders/${id}`);
    return null;
  });
}

export async function cancelPurchaseOrderAction(
  id: string,
  remarks: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.cancel);
    if (!remarks.trim()) throw new Error("A reason is required when cancelling a purchase order.");

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { _count: { select: { grns: true } } },
    });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (po._count.grns > 0) {
      throw new Error("Material has already been received against this PO, so it cannot be cancelled. Close it instead.");
    }

    await prisma.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      action: "CANCEL", entity: "PurchaseOrder", entityId: id, userId: ctx.id, projectId: po.projectId,
      summary: `Cancelled purchase order ${po.poNo}: ${remarks}`,
    });
    revalidatePath("/material/purchase-orders");
    revalidatePath(`/material/purchase-orders/${id}`);
    return null;
  });
}

export async function closePurchaseOrderAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.close);
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);

    await prisma.purchaseOrder.update({ where: { id }, data: { status: "CLOSED" } });
    await recordAudit({
      action: "UPDATE", entity: "PurchaseOrder", entityId: id, userId: ctx.id, projectId: po.projectId,
      summary: `Closed purchase order ${po.poNo} — no further receipts expected`,
    });
    revalidatePath("/material/purchase-orders");
    revalidatePath(`/material/purchase-orders/${id}`);
    return null;
  });
}
