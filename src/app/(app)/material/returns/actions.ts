"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  authorize, assertProjectAccess, PermissionError, runAction, type ActionResult,
} from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { approveReturn, deletePendingReturn, raiseReturn, rejectReturn } from "@/lib/material/returns";
import { RETURN_CONDITIONS } from "@/lib/material/return-caps";

/**
 * Material return actions: permission, project and input checks only. The
 * state rules, quantity caps and stock posting live in `@/lib/material/returns`.
 */

const RaiseSchema = z.object({
  issueId: z.string().min(1, "Choose the issue slip the material came from"),
  reason: z.string().trim().min(1, "Give a reason for the return"),
  lines: z
    .array(
      z.object({
        issueItemId: z.string().min(1),
        quantity: z.coerce.number().min(0, "Quantities cannot be negative"),
        condition: z.enum(RETURN_CONDITIONS).default("Good"),
        remarks: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, "Add at least one line"),
});

type RaiseInput = z.input<typeof RaiseSchema>;

function revalidateReturns(id?: string) {
  revalidatePath("/material/returns");
  if (id) revalidatePath(`/material/returns/${id}`);
  revalidatePath("/material/issues");
}

export async function raiseReturnAction(
  input: RaiseInput,
): Promise<ActionResult<{ id: string; returnNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.return.create);
    const parsed = RaiseSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const issue = await prisma.materialIssue.findUnique({
      where: { id: v.issueId },
      select: { projectId: true },
    });
    if (!issue) throw new Error("Issue slip not found.");
    assertProjectAccess(ctx, issue.projectId);

    const result = await prisma.$transaction((tx) =>
      raiseReturn(tx, {
        issueId: v.issueId,
        userId: ctx.id,
        scope: ctx,
        reason: v.reason,
        lines: v.lines,
        now: new Date(),
      }),
    );

    await recordAudit({
      action: "CREATE",
      entity: "MaterialReturn",
      entityId: result.id,
      userId: ctx.id,
      projectId: result.projectId,
      summary: `Raised return ${result.returnNo} with ${result.lines} line(s) worth ₹${result.totalValue.toLocaleString("en-IN")}`,
    });

    revalidateReturns(result.id);
    return { id: result.id, returnNo: result.returnNo };
  });
}

async function loadForDecision(id: string) {
  const ret = await prisma.materialReturn.findUnique({ where: { id }, select: { projectId: true } });
  if (!ret) throw new Error("Return not found.");
  return ret;
}

export async function approveReturnAction(id: string, note?: string): Promise<ActionResult<{ returnNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.return.approve);
    const ret = await loadForDecision(id);
    assertProjectAccess(ctx, ret.projectId);

    const result = await prisma.$transaction((tx) =>
      approveReturn(tx, { returnId: id, userId: ctx.id, note: note ?? null, now: new Date() }),
    );

    await recordAudit({
      action: "APPROVE",
      entity: "MaterialReturn",
      entityId: id,
      userId: ctx.id,
      projectId: result.projectId,
      summary: `Approved return ${result.returnNo}: ${result.lines} line(s) back to stock worth ₹${result.totalValue.toLocaleString("en-IN")}`,
    });

    revalidateReturns(id);
    revalidatePath("/material/stock");
    return { returnNo: result.returnNo };
  });
}

export async function rejectReturnAction(id: string, note: string): Promise<ActionResult<{ returnNo: string }>> {
  return runAction(async () => {
    // Rejecting is the other half of the same decision, so it needs approve.
    const ctx = await authorize(PERM.material.return.approve);
    const ret = await loadForDecision(id);
    assertProjectAccess(ctx, ret.projectId);

    const result = await prisma.$transaction((tx) =>
      rejectReturn(tx, { returnId: id, userId: ctx.id, note, now: new Date() }),
    );

    await recordAudit({
      action: "REJECT",
      entity: "MaterialReturn",
      entityId: id,
      userId: ctx.id,
      projectId: result.projectId,
      summary: `Rejected return ${result.returnNo}: ${note.trim()}`,
    });

    revalidateReturns(id);
    return { returnNo: result.returnNo };
  });
}

export async function deleteReturnAction(id: string): Promise<ActionResult<{ returnNo: string }>> {
  return runAction(async () => {
    // The raiser (who holds create) may delete their own pending return;
    // anyone else needs delete. The service enforces the raiser rule.
    const ctx = await authorize(PERM.material.return.view);
    const canDeleteAny = ctx.has(PERM.material.return.delete);
    if (!canDeleteAny && !ctx.has(PERM.material.return.create)) {
      throw new PermissionError(PERM.material.return.delete);
    }
    const ret = await loadForDecision(id);
    assertProjectAccess(ctx, ret.projectId);

    const result = await prisma.$transaction((tx) =>
      deletePendingReturn(tx, { returnId: id, userId: ctx.id, canDeleteAny }),
    );

    await recordAudit({
      action: "DELETE",
      entity: "MaterialReturn",
      entityId: id,
      userId: ctx.id,
      projectId: result.projectId,
      summary: `Deleted pending return ${result.returnNo}`,
    });

    revalidateReturns();
    return { returnNo: result.returnNo };
  });
}
