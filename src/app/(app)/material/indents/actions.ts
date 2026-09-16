"use server";

import { assertUnchanged, staleMessage } from "@/lib/material/procurement";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { indentEstimatedValue, isIndentEditable, mayEditIndentAs } from "@/lib/material/procurement";
import { applyIndentEdit } from "@/lib/material/procurement-edit";

const APPROVAL_SCOPE = "material.indent";

const ItemLineSchema = z.object({
  itemId: z.string().min(1),
  requestedQty: z.coerce.number().positive("Quantity must be greater than zero"),
  estimatedRate: z.coerce.number().min(0).default(0),
  specification: z.string().trim().optional(),
});

const IndentSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  workPackageId: z.string().optional(),
  requiredByDate: z.string().min(1, "Required-by date is needed"),
  purpose: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z.array(ItemLineSchema).min(1, "Add at least one item"),
});

/** The project is fixed; rates are resolved on the server, not taken from the form. */
const IndentEditSchema = z.object({
  workPackageId: z.string().optional(),
  requiredByDate: z.string().min(1, "Required-by date is needed"),
  purpose: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        itemId: z.string().min(1),
        requestedQty: z.coerce.number().positive("Quantity must be greater than zero"),
        specification: z.string().trim().optional(),
      }),
    )
    .min(1, "Add at least one item"),
});

export type IndentEditInput = z.infer<typeof IndentEditSchema>;

export async function createIndentAction(
  input: z.infer<typeof IndentSchema>,
  submit: boolean,
): Promise<ActionResult<{ id: string; indentNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.create);
    const parsed = IndentSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const v = parsed.data;
    assertProjectAccess(ctx, v.projectId);
    if (submit) await authorize(PERM.material.indent.submit);

    const estimatedValue = indentEstimatedValue(v.items);

    const indent = await prisma.$transaction(async (tx) => {
      const indentNo = await nextDocumentNumber(tx, "INDENT", v.projectId);
      return tx.indent.create({
        data: {
          indentNo,
          projectId: v.projectId,
          workPackageId: v.workPackageId || null,
          raisedById: ctx.id,
          requiredByDate: new Date(v.requiredByDate),
          purpose: v.purpose || null,
          remarks: v.remarks || null,
          estimatedValue,
          status: submit ? "SUBMITTED" : "DRAFT",
          items: {
            create: v.items.map((i) => ({
              itemId: i.itemId,
              requestedQty: i.requestedQty,
              estimatedRate: i.estimatedRate,
              specification: i.specification || null,
            })),
          },
        },
      });
    });

    await recordAudit({
      action: submit ? "SUBMIT" : "CREATE",
      entity: "Indent",
      entityId: indent.id,
      userId: ctx.id,
      projectId: v.projectId,
      summary: `${submit ? "Raised and submitted" : "Drafted"} indent ${indent.indentNo} for ₹${estimatedValue.toLocaleString("en-IN")} (${v.items.length} item lines)`,
    });

    revalidatePath("/material/indents");
    return { id: indent.id, indentNo: indent.indentNo };
  });
}

/**
 * Edits an indent before its first approval — a draft, or a submitted indent
 * with no approval step recorded. Only its raiser, or someone who sees every
 * indent, may do it. The state is checked here for the message and again as
 * the condition on the write, so an approval that lands in between wins.
 */
export async function updateIndentAction(
  id: string,
  input: IndentEditInput,
): Promise<ActionResult<{ id: string; estimatedValue: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.update);
    const parsed = IndentEditSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const indent = await prisma.indent.findUnique({
      where: { id },
      include: { items: true, _count: { select: { approvals: true } } },
    });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    if (!mayEditIndentAs(indent, { id: ctx.id, hasViewAll: ctx.has(PERM.material.indent.viewAll) })) {
      throw new PermissionError(PERM.material.indent.viewAll, "You can only edit indents you raised.");
    }
    if (!isIndentEditable({ status: indent.status, approvalCount: indent._count.approvals })) {
      throw new Error(
        `${indent.indentNo} is ${indent.status.replace(/_/g, " ").toLowerCase()}` +
          `${indent._count.approvals ? " with an approval step recorded" : ""} and can no longer be edited.`,
      );
    }

    const requiredByDate = new Date(v.requiredByDate);
    const result = await prisma.$transaction((tx) =>
      applyIndentEdit(tx, id, {
        workPackageId: v.workPackageId || null,
        requiredByDate,
        purpose: v.purpose || null,
        remarks: v.remarks || null,
        items: v.items.map((l) => ({ ...l, specification: l.specification || null })),
      }),
    );

    const lineSummary = (l: { itemId: string; requestedQty: unknown; estimatedRate: unknown }) =>
      `${l.itemId} × ${Number(l.requestedQty)} @ ${Number(l.estimatedRate)}`;

    const before = {
      workPackageId: indent.workPackageId,
      requiredByDate: indent.requiredByDate.toISOString(),
      purpose: indent.purpose,
      remarks: indent.remarks,
      estimatedValue: Number(indent.estimatedValue),
      lines: indent.items.map(lineSummary),
    };
    const after = {
      workPackageId: v.workPackageId || null,
      requiredByDate: requiredByDate.toISOString(),
      purpose: v.purpose || null,
      remarks: v.remarks || null,
      estimatedValue: result.estimatedValue,
      lines: result.lines.map(lineSummary),
    };

    await recordAudit({
      action: "UPDATE", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary:
        `Edited indent ${indent.indentNo} before approval — ₹${before.estimatedValue.toLocaleString("en-IN")} → ` +
        `₹${result.estimatedValue.toLocaleString("en-IN")} (${result.lines.length} item line(s))`,
      changes: diff(before, after),
    });

    revalidatePath("/material/indents");
    revalidatePath(`/material/indents/${id}`);
    return { id, estimatedValue: result.estimatedValue };
  });
}

export async function submitIndentAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.submit);
    const indent = await prisma.indent.findUnique({ where: { id } });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    if (indent.status !== "DRAFT") throw new Error("Only a draft indent can be submitted.");
    if (indent.raisedById !== ctx.id && !ctx.has(PERM.material.indent.viewAll)) {
      throw new PermissionError(PERM.material.indent.viewAll, "You can only submit indents you raised.");
    }

    await prisma.indent.update({ where: { id }, data: { status: "SUBMITTED" } });
    await recordAudit({
      action: "SUBMIT", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary: `Submitted indent ${indent.indentNo} for approval`,
    });
    revalidatePath("/material/indents");
    revalidatePath(`/material/indents/${id}`);
    return null;
  });
}

/**
 * Approves an indent at one level.
 *
 * Value-based routing: when a PM approves an indent whose value is at or below
 * their configured ceiling, the Admin level is skipped automatically and the
 * indent goes straight to ADMIN_APPROVED. Above the ceiling it waits for the
 * Owner / Admin step.
 */
export async function approveIndentAction(
  id: string,
  level: "PM" | "ADMIN",
  remarks: string,
  revisions: Array<{ itemId: string; approvedQty: number }> = [],
  expectedUpdatedAt?: string,
): Promise<ActionResult<{ status: string; skippedAdmin: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(
      level === "PM" ? PERM.material.indent.approvePm : PERM.material.indent.approveAdmin,
    );

    const indent = await prisma.indent.findUnique({ where: { id }, include: { items: true } });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    assertUnchanged(indent.updatedAt, expectedUpdatedAt, `Indent ${indent.indentNo}`);

    const expected = level === "PM" ? "SUBMITTED" : "PM_APPROVED";
    if (indent.status !== expected) {
      throw new Error(`This indent is ${indent.status.replace("_", " ").toLowerCase()} — it is not waiting for ${level} approval.`);
    }

    if (revisions.length > 0 && !ctx.has(PERM.material.indent.reviseQty)) {
      throw new PermissionError(PERM.material.indent.reviseQty, "You may approve but not revise quantities.");
    }

    // Apply quantity revisions and recompute the value they are approving.
    const revisionMap = new Map(revisions.map((r) => [r.itemId, r.approvedQty]));
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    let approvedValue = 0;

    for (const line of indent.items) {
      const requested = Number(line.requestedQty);
      const current = line.approvedQty === null ? requested : Number(line.approvedQty);
      const revised = revisionMap.has(line.id) ? revisionMap.get(line.id)! : current;
      if (revised !== current) changes[`qty:${line.itemId}`] = { from: current, to: revised };
      approvedValue += revised * Number(line.estimatedRate);
    }

    const ceiling = ctx.approvalLimitFor(APPROVAL_SCOPE);
    // An Admin-level approver above their ceiling is a configuration problem, not a routing one.
    if (level === "ADMIN" && !ctx.isSuperAdmin && ceiling > 0 && approvedValue > ceiling) {
      throw new PermissionError(
        APPROVAL_SCOPE,
        `₹${approvedValue.toLocaleString("en-IN")} is above your approval ceiling of ₹${ceiling.toLocaleString("en-IN")}.`,
      );
    }

    const withinPmCeiling = level === "PM" && (ctx.isSuperAdmin || (ceiling > 0 && approvedValue <= ceiling));
    const nextStatus = level === "ADMIN" || withinPmCeiling ? "ADMIN_APPROVED" : "PM_APPROVED";

    await prisma.$transaction(async (tx) => {
      // Claim the indent first, exactly as it was checked: an edit or another
      // decision landing in between wins, and nothing below is written.
      const claimed = await tx.indent.updateMany({
        where: { id, status: expected, updatedAt: indent.updatedAt },
        data: { status: nextStatus, estimatedValue: approvedValue },
      });
      if (claimed.count === 0) throw new Error(staleMessage(`Indent ${indent.indentNo}`));

      for (const line of indent.items) {
        const requested = Number(line.requestedQty);
        const current = line.approvedQty === null ? requested : Number(line.approvedQty);
        const revised = revisionMap.has(line.id) ? revisionMap.get(line.id)! : current;
        await tx.indentItem.update({
          where: { id: line.id },
          data: { approvedQty: revised, toPurchaseQty: revised },
        });
      }

      await tx.indentApproval.create({
        data: {
          indentId: id,
          level,
          decision: "APPROVED",
          approvedById: ctx.id,
          remarks: remarks || null,
          changes: Object.keys(changes).length ? (changes as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
    });

    await recordAudit({
      action: "APPROVE", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary:
        `Approved indent ${indent.indentNo} at ${level} level for ₹${approvedValue.toLocaleString("en-IN")}` +
        (withinPmCeiling ? " — below the approval ceiling, so the Admin level was skipped" : "") +
        (Object.keys(changes).length ? ` with ${Object.keys(changes).length} quantity revision(s)` : ""),
      changes: Object.keys(changes).length ? changes : null,
    });

    revalidatePath("/material/indents");
    revalidatePath(`/material/indents/${id}`);
    return { status: nextStatus, skippedAdmin: withinPmCeiling };
  });
}

export async function rejectIndentAction(id: string, remarks: string, expectedUpdatedAt?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.reject);
    if (!remarks.trim()) throw new Error("A reason is required when rejecting an indent.");

    const indent = await prisma.indent.findUnique({ where: { id } });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    if (!["SUBMITTED", "PM_APPROVED"].includes(indent.status)) {
      throw new Error("Only an indent awaiting approval can be rejected.");
    }

    assertUnchanged(indent.updatedAt, expectedUpdatedAt, `Indent ${indent.indentNo}`);

    const level = indent.status === "SUBMITTED" ? "PM" : "ADMIN";
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.indent.updateMany({
        where: { id, status: indent.status, updatedAt: indent.updatedAt },
        data: { status: "REJECTED" },
      });
      if (count === 0) throw new Error(staleMessage(`Indent ${indent.indentNo}`));
      await tx.indentApproval.create({
        data: { indentId: id, level, decision: "REJECTED", approvedById: ctx.id, remarks },
      });
    });

    await recordAudit({
      action: "REJECT", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary: `Rejected indent ${indent.indentNo}: ${remarks}`,
    });
    revalidatePath("/material/indents");
    revalidatePath(`/material/indents/${id}`);
    return null;
  });
}

export async function cancelIndentAction(id: string, remarks: string, expectedUpdatedAt?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.cancel);
    const indent = await prisma.indent.findUnique({ where: { id } });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    if (["ORDERED", "CLOSED"].includes(indent.status)) {
      throw new Error("An indent that has already been ordered cannot be cancelled.");
    }

    assertUnchanged(indent.updatedAt, expectedUpdatedAt, `Indent ${indent.indentNo}`);
    if (["CANCELLED", "REJECTED"].includes(indent.status)) {
      throw new Error(`Indent ${indent.indentNo} is already ${indent.status.toLowerCase()}.`);
    }

    const { count: cancelled } = await prisma.indent.updateMany({
      where: { id, status: indent.status, updatedAt: indent.updatedAt },
      data: { status: "CANCELLED" },
    });
    if (cancelled === 0) throw new Error(staleMessage(`Indent ${indent.indentNo}`));
    await recordAudit({
      action: "CANCEL", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary: `Cancelled indent ${indent.indentNo}${remarks ? `: ${remarks}` : ""}`,
    });
    revalidatePath("/material/indents");
    revalidatePath(`/material/indents/${id}`);
    return null;
  });
}

/**
 * Stock check: marks the portion of each line that can be issued from store,
 * so only the shortfall becomes a purchase order.
 */
export async function stockCheckAction(id: string): Promise<ActionResult<{ linesCovered: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.stockCheck);
    const indent = await prisma.indent.findUnique({ where: { id }, include: { items: true } });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);

    const balances = await prisma.stockBalance.groupBy({
      by: ["itemId"],
      where: { itemId: { in: indent.items.map((i) => i.itemId) } },
      _sum: { quantity: true },
    });
    const onHand = new Map(balances.map((b) => [b.itemId, Number(b._sum.quantity ?? 0)]));

    let linesCovered = 0;
    await prisma.$transaction(async (tx) => {
      for (const line of indent.items) {
        const needed = line.approvedQty === null ? Number(line.requestedQty) : Number(line.approvedQty);
        const available = onHand.get(line.itemId) ?? 0;
        const fromStock = Math.min(needed, Math.max(0, available));
        const toPurchase = Math.max(0, needed - fromStock);
        if (fromStock > 0) linesCovered++;
        await tx.indentItem.update({
          where: { id: line.id },
          data: { issueFromStockQty: fromStock, toPurchaseQty: toPurchase },
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary: `Ran the stock check on ${indent.indentNo} — ${linesCovered} line(s) can be issued from store`,
    });
    revalidatePath(`/material/indents/${id}`);
    return { linesCovered };
  });
}

/**
 * Deletes an indent outright, which is what the design's Delete does.
 *
 * Only an indent nothing else depends on can go: once it has been ordered or
 * issued against, the record is part of the material trail and stays.
 */
export async function deleteIndentAction(id: string, expectedUpdatedAt?: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.indent.delete);
    const indent = await prisma.indent.findUnique({
      where: { id },
      select: {
        id: true, indentNo: true, projectId: true, updatedAt: true,
        _count: { select: { poItems: true, purchaseOrders: true, issues: true } },
      },
    });
    if (!indent) throw new Error("Indent not found.");
    assertProjectAccess(ctx, indent.projectId);
    assertUnchanged(indent.updatedAt, expectedUpdatedAt, `Indent ${indent.indentNo}`);

    if (indent._count.poItems > 0 || indent._count.purchaseOrders > 0) {
      throw new Error(`${indent.indentNo} is already on a purchase order, so it cannot be deleted.`);
    }
    if (indent._count.issues > 0) {
      throw new Error(`${indent.indentNo} has material issued against it, so it cannot be deleted.`);
    }

    const { count } = await prisma.indent.deleteMany({ where: { id, updatedAt: indent.updatedAt } });
    if (count === 0) throw new Error(staleMessage(`Indent ${indent.indentNo}`));

    await recordAudit({
      action: "DELETE", entity: "Indent", entityId: id, userId: ctx.id, projectId: indent.projectId,
      summary: `Deleted indent ${indent.indentNo}`,
    });
    revalidatePath("/material/indents");
    return null;
  });
}
