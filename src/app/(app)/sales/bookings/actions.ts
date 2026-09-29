"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { buildPaymentSchedule } from "@/lib/sales/cost-sheet";
import { clearsOnEntry } from "@/lib/sales/receipt-status";
import { PERM } from "@/lib/permissions/codes";

/* -------------------------------- Customers ------------------------------- */

const CustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required"),
  phone: z.string().trim().min(8, "A valid phone number is required"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  addressLine: z.string().trim().optional(),
  panNumber: z.string().trim().optional(),
  aadhaarNumber: z.string().trim().optional(),
});

export async function createCustomerAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.customer.create);
    const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const customer = await prisma.$transaction(async (tx) => {
      const customerNo = await nextDocumentNumber(tx, "CUSTOMER", null);
      return tx.customer.create({
        data: {
          customerNo,
          name: v.name,
          phone: v.phone,
          email: v.email || null,
          addressLine: v.addressLine || null,
          panNumber: v.panNumber || null,
          aadhaarNumber: v.aadhaarNumber || null,
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Customer", entityId: customer.id, userId: ctx.id,
      summary: `Created customer ${customer.customerNo} — ${customer.name}`,
    });

    revalidatePath("/sales/customers");
    return { id: customer.id };
  });
}

export async function verifyKycAction(customerId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.customer.verifyKyc);

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error("Customer not found.");
    if (customer.kycVerifiedAt) throw new Error("KYC is already verified for this customer.");
    if (!customer.panNumber) throw new Error("Record the PAN before verifying KYC.");

    await prisma.customer.update({ where: { id: customerId }, data: { kycVerifiedAt: new Date() } });
    await recordAudit({
      action: "APPROVE", entity: "Customer", entityId: customerId, userId: ctx.id,
      summary: `Verified KYC for ${customer.name}`,
    });

    revalidatePath("/sales/customers");
    return null;
  });
}

/* --------------------------------- Bookings ------------------------------- */

/**
 * Books a unit.
 *
 * One transaction ties together: the unit leaves the availability board, the
 * hold is released, the customer is attached, and the construction-linked
 * payment schedule is raised from the cost sheet total.
 */
export async function createBookingAction(
  costSheetId: string,
  customerId: string,
  leadId: string | null,
  /** What was agreed when it was booked — the board's remarks box. */
  remarks: string | null = null,
): Promise<ActionResult<{ id: string; bookingNo: string; demands: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.booking.create);

    const created = await prisma.$transaction(async (tx) => {
      const sheet = await tx.costSheet.findUnique({
        where: { id: costSheetId },
        include: { unit: { select: { id: true, unitNumber: true, projectId: true, status: true } } },
      });
      if (!sheet) throw new Error("Cost sheet not found.");
      assertProjectAccess(ctx, sheet.unit.projectId);

      if (["BOOKED", "AGREEMENT", "REGISTERED"].includes(sheet.unit.status)) {
        throw new Error(`${sheet.unit.unitNumber} is already ${sheet.unit.status.toLowerCase()}.`);
      }
      if (sheet.unit.status === "BLOCKED") {
        throw new Error(`${sheet.unit.unitNumber} is blocked from sale. Unblock it on the Units screen before booking.`);
      }

      // A discount that was never approved must not walk into a booking.
      if (Number(sheet.discountAmount) > 0 && !sheet.discountApprovedAt) {
        throw new Error(
          "This cost sheet carries an unapproved discount. It needs discount approval before booking.",
        );
      }

      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new Error("Customer not found.");

      // Claim the unit exactly as it was checked. A block, another booking or a
      // hold landing in between wins, and nothing below is written.
      const claimed = await tx.unit.updateMany({
        where: { id: sheet.unit.id, status: sheet.unit.status },
        data: { status: "BOOKED" },
      });
      if (claimed.count === 0) {
        throw new Error(`${sheet.unit.unitNumber} changed while this booking was being made. Reload and check its status.`);
      }

      const bookingNo = await nextDocumentNumber(tx, "BOOKING", sheet.unit.projectId);
      const bookingDate = new Date();
      const total = Number(sheet.totalAmount);

      const booking = await tx.booking.create({
        data: {
          bookingNo,
          projectId: sheet.unit.projectId,
          unitId: sheet.unit.id,
          customerId,
          leadId,
          costSheetId,
          bookingDate,
          totalAmount: total,
          soldById: ctx.id,
          remarks: remarks?.trim() || null,
          status: "CONFIRMED",
        },
      });

      // Raise the milestone demands off the booking total.
      const schedule = buildPaymentSchedule(total, bookingDate);
      for (const m of schedule) {
        const demandNo = await nextDocumentNumber(tx, "DEMAND", sheet.unit.projectId);
        await tx.paymentDemand.create({
          data: {
            demandNo,
            bookingId: booking.id,
            milestone: m.milestone,
            dueDate: m.dueDate,
            amount: m.amount,
            totalAmount: m.amount,
            sortOrder: m.sortOrder,
            status: m.sortOrder === 0 ? "RAISED" : "PENDING",
            raisedAt: m.sortOrder === 0 ? bookingDate : null,
          },
        });
      }

      await tx.unitHold.updateMany({
        where: { unitId: sheet.unit.id, isActive: true },
        data: { isActive: false, releasedAt: bookingDate, releaseNote: `Booked on ${bookingNo}` },
      });
      if (leadId) {
        await tx.lead.update({ where: { id: leadId }, data: { state: "BOOKED" } });
      }

      return {
        id: booking.id,
        bookingNo,
        demands: schedule.length,
        unitNumber: sheet.unit.unitNumber,
        projectId: sheet.unit.projectId,
        customerName: customer.name,
        total,
      };
    });

    await recordAudit({
      action: "CREATE", entity: "Booking", entityId: created.id, userId: ctx.id,
      projectId: created.projectId,
      summary: `Booked unit ${created.unitNumber} to ${created.customerName} on ${created.bookingNo} for ₹${created.total.toLocaleString("en-IN")} — ${created.demands} milestone demand(s) raised`,
    });

    revalidatePath("/sales/bookings");
    revalidatePath("/units/board");
    return { id: created.id, bookingNo: created.bookingNo, demands: created.demands };
  });
}

/** Moves a booking through agreement and registration, taking the unit with it. */
export async function advanceBookingAction(
  bookingId: string,
  to: "AGREEMENT" | "REGISTERED",
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(
      to === "AGREEMENT" ? PERM.sales.booking.agreement : PERM.sales.booking.register,
    );

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { unit: { select: { id: true, unitNumber: true } } },
    });
    if (!booking) throw new Error("Booking not found.");
    assertProjectAccess(ctx, booking.projectId);

    if (to === "AGREEMENT" && booking.status !== "CONFIRMED") {
      throw new Error("Only a confirmed booking can move to agreement.");
    }
    if (to === "REGISTERED" && booking.status !== "AGREEMENT") {
      throw new Error("A booking must reach agreement before it can be registered.");
    }

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: to,
          ...(to === "AGREEMENT" ? { agreementDate: new Date() } : { registrationDate: new Date() }),
        },
      }),
      prisma.unit.update({ where: { id: booking.unit.id }, data: { status: to } }),
    ]);

    await recordAudit({
      action: "UPDATE", entity: "Booking", entityId: bookingId, userId: ctx.id,
      projectId: booking.projectId,
      summary: `Moved booking ${booking.bookingNo} for unit ${booking.unit.unitNumber} to ${to.toLowerCase()}`,
    });

    revalidatePath("/sales/bookings");
    revalidatePath("/units/board");
    return null;
  });
}

export async function cancelBookingAction(
  bookingId: string,
  remarks: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.booking.cancel);
    if (!remarks.trim()) throw new Error("A reason is required when cancelling a booking.");

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { select: { id: true, unitNumber: true } },
        _count: { select: { receipts: true } },
      },
    });
    if (!booking) throw new Error("Booking not found.");
    assertProjectAccess(ctx, booking.projectId);
    if (booking.status === "REGISTERED") {
      throw new Error("A registered booking cannot be cancelled here — it needs a legal deed cancellation.");
    }

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED", remarks },
      }),
      // The unit goes back on the board.
      prisma.unit.update({ where: { id: booking.unit.id }, data: { status: "AVAILABLE" } }),
      prisma.paymentDemand.updateMany({
        where: { bookingId, status: { in: ["PENDING", "RAISED"] } },
        data: { status: "CANCELLED" },
      }),
    ]);

    await recordAudit({
      action: "CANCEL", entity: "Booking", entityId: bookingId, userId: ctx.id,
      projectId: booking.projectId,
      summary:
        `Cancelled booking ${booking.bookingNo} for unit ${booking.unit.unitNumber}: ${remarks}` +
        (booking._count.receipts > 0 ? ` — ${booking._count.receipts} receipt(s) already collected, refund handled outside the system` : ""),
    });

    revalidatePath("/sales/bookings");
    revalidatePath("/units/board");
    return null;
  });
}

/* --------------------------- Demands and receipts ------------------------- */

export async function raiseDemandAction(demandId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.demand.raise);

    const demand = await prisma.paymentDemand.findUnique({
      where: { id: demandId },
      include: { booking: { select: { bookingNo: true, projectId: true } } },
    });
    if (!demand) throw new Error("Demand not found.");
    assertProjectAccess(ctx, demand.booking.projectId);
    if (demand.status !== "PENDING") throw new Error("This demand has already been raised.");

    await prisma.paymentDemand.update({
      where: { id: demandId },
      data: { status: "RAISED", raisedAt: new Date() },
    });

    await recordAudit({
      action: "UPDATE", entity: "PaymentDemand", entityId: demandId, userId: ctx.id,
      projectId: demand.booking.projectId,
      summary: `Raised demand ${demand.demandNo} (${demand.milestone}) for ₹${Number(demand.totalAmount).toLocaleString("en-IN")} on ${demand.booking.bookingNo}`,
    });

    revalidatePath("/sales/bookings");
    return null;
  });
}

export async function createReceiptAction(
  bookingId: string,
  demandId: string | null,
  amount: number,
  mode: string,
  referenceNo: string,
  bankId: string | null,
): Promise<ActionResult<{ receiptNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.receipt.create);

    const created = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { customer: { select: { name: true } } },
      });
      if (!booking) throw new Error("Booking not found.");
      assertProjectAccess(ctx, booking.projectId);
      if (booking.status === "CANCELLED") throw new Error("This booking is cancelled.");
      if (!(amount > 0)) throw new Error("Enter an amount greater than zero.");

      const outstanding = Number(booking.totalAmount) - Number(booking.receivedAmount);
      if (amount > outstanding + 0.01) {
        throw new Error(
          `That is more than the ₹${outstanding.toLocaleString("en-IN")} still outstanding on this booking.`,
        );
      }

      const receiptNo = await nextDocumentNumber(tx, "RECEIPT", booking.projectId);
      // Electronic and cash money is realised on entry; a cheque or DD waits
      // for the bank and is cleared (or bounced) from the receipts list.
      const clearedNow = clearsOnEntry(mode);
      await tx.receipt.create({
        data: {
          receiptNo,
          bookingId,
          demandId,
          amount,
          mode,
          referenceNo: referenceNo || null,
          bankId,
          clearedAt: clearedNow ? new Date() : null,
          clearedById: clearedNow ? ctx.id : null,
        },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: { receivedAmount: { increment: amount } },
      });

      // Advance the demand this receipt was applied against.
      if (demandId) {
        const demand = await tx.paymentDemand.findUnique({ where: { id: demandId } });
        if (demand) {
          const received = Number(demand.receivedAmount) + amount;
          const settled = received >= Number(demand.totalAmount) - 0.01;
          await tx.paymentDemand.update({
            where: { id: demandId },
            data: { receivedAmount: received, status: settled ? "PAID" : "PARTIALLY_PAID" },
          });
        }
      }

      return { receiptNo, projectId: booking.projectId, customerName: booking.customer.name, bookingNo: booking.bookingNo };
    });

    await recordAudit({
      action: "CREATE", entity: "Receipt", userId: ctx.id, projectId: created.projectId,
      summary: `Collected ₹${amount.toLocaleString("en-IN")} from ${created.customerName} on ${created.receiptNo} against ${created.bookingNo} (${mode})`,
    });

    revalidatePath("/sales/bookings");
    revalidatePath("/sales/receipts");
    return { receiptNo: created.receiptNo };
  });
}
