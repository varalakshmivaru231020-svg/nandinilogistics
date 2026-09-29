"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import {
  authorize, runAction, assertProjectAccess, assertWithinApprovalLimit,
  type ActionResult,
} from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { generateCostSheetFor, expireStaleHolds } from "@/lib/sales/service";
import { PERM } from "@/lib/permissions/codes";

/* ------------------------------- Unit holds ------------------------------- */

/** Default hold window. A hold releases itself unless an extension is approved. */
const HOLD_DAYS = 7;

export async function holdUnitAction(
  unitId: string,
  leadId: string | null,
  /** Who the unit is being held for — the board asks before it holds. */
  customerId: string | null = null,
  remarks: string | null = null,
  days: number = HOLD_DAYS,
): Promise<ActionResult<{ expiresAt: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.hold.create);

    const result = await prisma.$transaction(async (tx) => {
      await expireStaleHolds(tx);

      const unit = await tx.unit.findUnique({ where: { id: unitId } });
      if (!unit) throw new Error("Unit not found.");
      assertProjectAccess(ctx, unit.projectId);

      // Holding a flat that is already held moves the hold to somebody else —
      // the customer who was first in the queue dropped out, the next one takes
      // it. Anything further along than a hold is not a hold's business.
      if (unit.status !== "AVAILABLE" && unit.status !== "HELD") {
        throw new Error(
          `${unit.unitNumber} is ${unit.status.toLowerCase()} and cannot be held.`,
        );
      }

      // Claim the unit only if it has not moved since it was read: a booking or
      // a block landing in between wins, and no second hold is created.
      const claimed = await tx.unit.updateMany({
        where: { id: unitId, status: unit.status },
        data: { status: "HELD" },
      });
      if (claimed.count === 0) throw new Error(`${unit.unitNumber} was just taken. Reload and pick another unit.`);

      // One flat, one live hold. The one being replaced is closed, not dropped,
      // so the trail still shows who had it and why it moved.
      const replaced = await tx.unitHold.updateMany({
        where: { unitId, isActive: true },
        data: { isActive: false, releasedAt: new Date(), releaseNote: "Hold moved to another customer" },
      });

      // Naming a customer who does not exist would leave the hold pointing at
      // nothing, so it is checked before the row is written.
      let heldFor: string | null = null;
      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId }, select: { name: true },
        });
        if (!customer) throw new Error("Customer not found.");
        heldFor = customer.name;
      }

      const expiresAt = new Date(Date.now() + days * 86_400_000);
      await tx.unitHold.create({
        data: {
          unitId, leadId, customerId,
          remarks: remarks?.trim() || null,
          heldById: ctx.id, expiresAt, isActive: true,
        },
      });

      return { unitNumber: unit.unitNumber, projectId: unit.projectId, expiresAt, heldFor, replaced: replaced.count > 0 };
    });

    await recordAudit({
      action: "CREATE", entity: "UnitHold", entityId: unitId, userId: ctx.id,
      projectId: result.projectId,
      summary:
        `${result.replaced ? "Moved the hold on" : "Held"} unit ${result.unitNumber}` +
        (result.heldFor ? ` for ${result.heldFor}` : "") +
        ` until ${result.expiresAt.toLocaleDateString("en-IN")}`,
    });

    revalidatePath("/units/board");
    revalidatePath("/units");
    return { expiresAt: result.expiresAt.toISOString() };
  });
}

export async function releaseHoldAction(holdId: string, note: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.hold.release);

    const hold = await prisma.unitHold.findUnique({
      where: { id: holdId },
      include: { unit: { select: { id: true, unitNumber: true, projectId: true, status: true } } },
    });
    if (!hold) throw new Error("Hold not found.");
    if (!hold.isActive) throw new Error("This hold is already released.");
    assertProjectAccess(ctx, hold.unit.projectId);

    await prisma.$transaction(async (tx) => {
      const released = await tx.unitHold.updateMany({
        where: { id: holdId, isActive: true },
        data: { isActive: false, releasedAt: new Date(), releaseNote: note || null },
      });
      if (released.count === 0) throw new Error("This hold is already released.");

      // Back to AVAILABLE only if the unit is still merely held, and by no other
      // active hold — never undo a booking or a block made meanwhile.
      const otherHolds = await tx.unitHold.count({ where: { unitId: hold.unit.id, isActive: true } });
      if (otherHolds === 0) {
        await tx.unit.updateMany({ where: { id: hold.unit.id, status: "HELD" }, data: { status: "AVAILABLE" } });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "UnitHold", entityId: holdId, userId: ctx.id,
      projectId: hold.unit.projectId,
      summary: `Released the hold on ${hold.unit.unitNumber}${note ? `: ${note}` : ""}`,
    });

    revalidatePath("/units/board");
    return null;
  });
}

/* ------------------------------- Cost sheets ------------------------------ */

export async function createCostSheetAction(
  unitId: string,
  leadId: string | null,
  includeOptional: string[],
  discountAmount: number,
): Promise<ActionResult<{ id: string; costSheetNo: string; total: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.costSheet.create);

    const created = await prisma.$transaction(async (tx) => {
      const { unit, sheet, baseRate } = await generateCostSheetFor(tx, unitId, {
        includeOptional,
        discountAmount,
      });
      assertProjectAccess(ctx, unit.projectId);

      const costSheetNo = await nextDocumentNumber(tx, "COSTSHEET", unit.projectId);

      const record = await tx.costSheet.create({
        data: {
          costSheetNo,
          unitId,
          leadId,
          baseRate,
          subTotal: sheet.subTotal,
          discountAmount: sheet.discountAmount,
          taxAmount: sheet.taxAmount,
          totalAmount: sheet.totalAmount,
          validUntil: new Date(Date.now() + 15 * 86_400_000),
          createdById: ctx.id,
          lines: {
            create: sheet.lines.map((l) => ({
              chargeHeadId: l.chargeHeadId,
              label: l.label,
              quantity: l.quantity,
              rate: l.rate,
              amount: l.amount,
              taxPct: l.taxPct,
              taxAmount: l.taxAmount,
              sortOrder: l.sortOrder,
            })),
          },
        },
      });

      return {
        id: record.id,
        costSheetNo,
        total: sheet.totalAmount,
        unitNumber: unit.unitNumber,
        projectId: unit.projectId,
      };
    });

    await recordAudit({
      action: "CREATE", entity: "CostSheet", entityId: created.id, userId: ctx.id,
      projectId: created.projectId,
      summary: `Generated cost sheet ${created.costSheetNo} for unit ${created.unitNumber} at ₹${created.total.toLocaleString("en-IN")}`,
    });

    revalidatePath("/sales/cost-sheets");
    return { id: created.id, costSheetNo: created.costSheetNo, total: created.total };
  });
}

/** A discount above the approver's ceiling has to go up a level. */
export async function approveDiscountAction(
  costSheetId: string,
  remarks: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.costSheet.approveDiscount);

    const sheet = await prisma.costSheet.findUnique({
      where: { id: costSheetId },
      include: { unit: { select: { unitNumber: true, projectId: true } } },
    });
    if (!sheet) throw new Error("Cost sheet not found.");
    assertProjectAccess(ctx, sheet.unit.projectId);

    const discount = Number(sheet.discountAmount);
    if (discount <= 0) throw new Error("This cost sheet carries no discount to approve.");
    if (sheet.discountApprovedAt) throw new Error("This discount is already approved.");

    assertWithinApprovalLimit(ctx, "sales.discount", discount);

    await prisma.costSheet.update({
      where: { id: costSheetId },
      data: { discountApprovedById: ctx.id, discountApprovedAt: new Date() },
    });

    await recordAudit({
      action: "APPROVE", entity: "CostSheet", entityId: costSheetId, userId: ctx.id,
      projectId: sheet.unit.projectId,
      summary: `Approved a ₹${discount.toLocaleString("en-IN")} discount on ${sheet.costSheetNo} for unit ${sheet.unit.unitNumber}${remarks ? ` — ${remarks}` : ""}`,
    });

    revalidatePath(`/sales/cost-sheets/${costSheetId}`);
    return null;
  });
}
