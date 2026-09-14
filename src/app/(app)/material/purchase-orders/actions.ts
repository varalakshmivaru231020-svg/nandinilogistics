"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  authorize, runAction, assertProjectAccess, assertWithinApprovalLimit,
  type ActionResult,
} from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { isPoEditable, poTotals, priceLine } from "@/lib/material/procurement";
import { applyPurchaseOrderEdit } from "@/lib/material/procurement-edit";

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

/** What an edit may change: everything the create form captures except the project. */
const PoEditSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  paymentTermId: z.string().optional(),
  expectedDate: z.string().optional(),
  deliveryAddress: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  otherCharges: z.coerce.number().min(0).default(0),
  items: z
    .array(LineSchema.omit({ indentId: true }).extend({ id: z.string().optional() }))
    .min(1, "Add at least one item"),
});

export type PoEditInput = z.infer<typeof PoEditSchema>;

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

    const { subTotal, taxAmount, totalAmount } = poTotals(v.items, v.otherCharges);

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
          status: submitForApproval ? "PENDING_PM_APPROVAL" : "DRAFT",
          items: {
            create: v.items.map((l) => {
              const { total } = priceLine(l);
              return {
                itemId: l.itemId,
                indentId: l.indentId || null,
                orderedQty: l.orderedQty,
                rate: l.rate,
                discountPct: l.discountPct,
                taxPct: l.taxPct,
                amount: total,
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

/**
 * Edits an order nobody has approved yet — a draft, or one waiting on its PM
 * approval with none recorded. Approved orders go through a revision instead.
 *
 * The state is checked twice: here, for a clear message, and again as the
 * condition on the write itself, so an approval that lands in between wins.
 * Rates are part of what is edited, so the rate permission is required too.
 */
export async function updatePurchaseOrderAction(
  id: string,
  input: PoEditInput,
): Promise<ActionResult<{ id: string; totalAmount: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.update, PERM.material.purchaseOrder.viewRate);
    const parsed = PoEditSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (!isPoEditable(po)) {
      throw new Error(
        `${po.poNo} is ${po.status.replace(/_/g, " ").toLowerCase()}${po.pmApprovedAt ? " with an approval recorded" : ""} and can no longer be edited.` +
          (po.status === "APPROVED" ? " Raise a revision instead." : ""),
      );
    }

    const expectedDate = v.expectedDate ? new Date(v.expectedDate) : null;
    if (expectedDate && Number.isNaN(expectedDate.getTime())) throw new Error("Expected delivery is not a valid date.");

    const result = await prisma.$transaction((tx) =>
      applyPurchaseOrderEdit(tx, id, {
        vendorId: v.vendorId,
        paymentTermId: v.paymentTermId || null,
        expectedDate,
        deliveryAddress: v.deliveryAddress || null,
        terms: v.terms || null,
        otherCharges: v.otherCharges,
        items: v.items.map((l) => ({ ...l, specification: l.specification || null })),
      }),
    );

    const lineSummary = (l: { itemId: string; orderedQty: unknown; rate: unknown; discountPct: unknown; taxPct: unknown }) =>
      `${l.itemId} × ${Number(l.orderedQty)} @ ${Number(l.rate)} −${Number(l.discountPct)}% +${Number(l.taxPct)}%`;

    const before = {
      vendorId: po.vendorId,
      paymentTermId: po.paymentTermId,
      expectedDate: po.expectedDate?.toISOString() ?? null,
      deliveryAddress: po.deliveryAddress,
      terms: po.terms,
      otherCharges: Number(po.otherCharges),
      subTotal: Number(po.subTotal),
      taxAmount: Number(po.taxAmount),
      totalAmount: Number(po.totalAmount),
      lines: po.items.map(lineSummary),
    };
    const after = {
      vendorId: v.vendorId,
      paymentTermId: v.paymentTermId || null,
      expectedDate: expectedDate?.toISOString() ?? null,
      deliveryAddress: v.deliveryAddress || null,
      terms: v.terms || null,
      otherCharges: v.otherCharges,
      subTotal: result.subTotal,
      taxAmount: result.taxAmount,
      totalAmount: result.totalAmount,
      lines: v.items.map(lineSummary),
    };

    await recordAudit({
      action: "UPDATE",
      entity: "PurchaseOrder",
      entityId: id,
      userId: ctx.id,
      projectId: po.projectId,
      summary:
        `Edited ${po.poNo} before approval — total ₹${before.totalAmount.toLocaleString("en-IN")} → ` +
        `₹${result.totalAmount.toLocaleString("en-IN")} (${result.lineCount} line(s))`,
      changes: diff(before, after),
    });

    revalidatePath("/material/purchase-orders");
    revalidatePath(`/material/purchase-orders/${id}`);
    return { id, totalAmount: result.totalAmount };
  });
}

/**
 * The design approves a purchase order in two levels — Project Manager, then
 * Owner/Admin — and shows both on the list. Each level is its own permission,
 * so they can be held by different people; a single person holding both still
 * has to pass it twice, which is what makes the second level mean anything.
 *
 * Value-based routing applies at each level: an approver may not exceed their
 * configured ceiling.
 */
type ApprovalLevel = "PM" | "ADMIN";

async function approveAtLevel(id: string, level: ApprovalLevel, remarks: string) {
  const ctx = await authorize(
    level === "PM" ? PERM.material.purchaseOrder.approvePm : PERM.material.purchaseOrder.approveAdmin,
  );

  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new Error("Purchase order not found.");
  assertProjectAccess(ctx, po.projectId);

  const awaitingPm = ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL"].includes(po.status);
  const awaitingAdmin = po.status === "PENDING_ADMIN_APPROVAL";

  if (level === "PM" && !awaitingPm) {
    throw new Error(
      po.pmApprovedById
        ? `${po.poNo} already has its Project Manager approval.`
        : `${po.poNo} is ${po.status.replace(/_/g, " ").toLowerCase()} and cannot take a PM approval.`,
    );
  }
  if (level === "ADMIN" && !awaitingAdmin) {
    throw new Error(
      awaitingPm
        ? `${po.poNo} needs its Project Manager approval first.`
        : `${po.poNo} is ${po.status.replace(/_/g, " ").toLowerCase()} and cannot be approved again.`,
    );
  }

  assertWithinApprovalLimit(ctx, APPROVAL_SCOPE, Number(po.totalAmount));

  const now = new Date();
  await prisma.purchaseOrder.update({
    where: { id },
    data:
      level === "PM"
        ? { status: "PENDING_ADMIN_APPROVAL", pmApprovedById: ctx.id, pmApprovedAt: now }
        : {
            status: "APPROVED",
            adminApprovedById: ctx.id, adminApprovedAt: now,
            // Kept in step so anything still reading the old field stays right.
            approvedById: ctx.id, approvedAt: now,
          },
  });

  // Only a fully approved order marks its indents ordered.
  if (level === "ADMIN") {
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
  }

  await recordAudit({
    action: "APPROVE",
    entity: "PurchaseOrder",
    entityId: id,
    userId: ctx.id,
    projectId: po.projectId,
    summary:
      `${level === "PM" ? "PM approved" : "Admin approved"} purchase order ${po.poNo}` +
      ` for ₹${Number(po.totalAmount).toLocaleString("en-IN")}${remarks ? ` — ${remarks}` : ""}`,
  });

  revalidatePath("/material/purchase-orders");
  revalidatePath(`/material/purchase-orders/${id}`);
  return null;
}

export async function approvePoPmAction(id: string, remarks = ""): Promise<ActionResult<null>> {
  return runAction(() => approveAtLevel(id, "PM", remarks));
}

export async function approvePoAdminAction(id: string, remarks = ""): Promise<ActionResult<null>> {
  return runAction(() => approveAtLevel(id, "ADMIN", remarks));
}

/**
 * Editing an approved order raises its revision and sends it back through both
 * approvals, per the design's own note. The previous approvals are cleared
 * rather than kept, because they applied to different numbers.
 */
export async function revisePurchaseOrderAction(id: string, reason: string): Promise<ActionResult<{ revision: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.purchaseOrder.revise);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { _count: { select: { grns: true } } },
    });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (po.status !== "APPROVED") {
      throw new Error("Only an approved purchase order is revised — edit a draft directly.");
    }
    if (po._count.grns > 0) {
      throw new Error(
        `${po.poNo} already has material received against it. Revising it now would change an order the store has acted on.`,
      );
    }
    if (!reason.trim()) throw new Error("A revision needs a reason.");

    const revision = po.revision + 1;
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        revision,
        status: "PENDING_PM_APPROVAL",
        pmApprovedById: null, pmApprovedAt: null,
        adminApprovedById: null, adminApprovedAt: null,
        approvedById: null, approvedAt: null,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "PurchaseOrder", entityId: id, userId: ctx.id,
      projectId: po.projectId,
      summary: `Revised ${po.poNo} to rev ${revision} — ${reason.trim()}. Approvals restarted.`,
    });

    revalidatePath("/material/purchase-orders");
    revalidatePath(`/material/purchase-orders/${id}`);
    return { revision };
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
