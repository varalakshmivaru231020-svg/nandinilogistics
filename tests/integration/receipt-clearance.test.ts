import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { n, prisma, tag } from "./helpers";

import { createReceiptAction } from "@/app/(app)/sales/bookings/actions";
import { bounceReceiptAction, clearReceiptAction } from "@/app/(app)/sales/receipts/actions";
import { indiaDay, receiptStatus } from "@/lib/sales/receipt-status";

bindCookieBox(cookieBox);

/**
 * Cheques and DDs clear or bounce after entry. A bounce takes the money back
 * off the booking and its demand exactly once; a cleared instrument stays
 * cleared; and only a holder of sales.receipt.clear can do either.
 *
 * Everything hangs off a throwaway project, so no seeded booking is touched.
 */
describe("receipt clearance and bounce", () => {
  const S = tag().toUpperCase();
  let projectId: string;
  let blockId: string;
  let unitId: string;
  let customerId: string;
  const bookingIds: string[] = [];
  let seq = 0;

  const OWNER = "owner@nninfra.example";
  const SALES = "sales@nninfra.example";

  /** A fresh booking with one demand, so each test starts from known figures. */
  async function makeBooking(demandTotal = 200_000, raised = true) {
    seq += 1;
    const booking = await prisma.booking.create({
      data: {
        bookingNo: `BK-RC-${S}-${seq}`, projectId, unitId, customerId,
        totalAmount: 1_000_000, receivedAmount: 0, status: "CONFIRMED",
      },
    });
    bookingIds.push(booking.id);
    const demand = await prisma.paymentDemand.create({
      data: {
        demandNo: `DM-RC-${S}-${seq}`, bookingId: booking.id, milestone: `Slab ${seq}`,
        dueDate: new Date(), amount: demandTotal, totalAmount: demandTotal,
        raisedAt: raised ? new Date() : null, status: raised ? "RAISED" : "PENDING",
      },
    });
    return { bookingId: booking.id, demandId: demand.id };
  }

  async function collect(bookingId: string, demandId: string, amount: number, mode: string) {
    const res = await createReceiptAction(bookingId, demandId, amount, mode, `REF-${S}`, null);
    if (!res.ok) throw new Error(res.error);
    return prisma.receipt.findUniqueOrThrow({ where: { receiptNo: res.data.receiptNo } });
  }

  const booking = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });
  const demand = (id: string) => prisma.paymentDemand.findUniqueOrThrow({ where: { id } });
  const receipt = (id: string) => prisma.receipt.findUniqueOrThrow({ where: { id } });
  const today = () => indiaDay(new Date());

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    projectId = (await prisma.project.create({
      data: { code: `RC${S}`.slice(0, 20), name: `Receipt clearance ${S}`, projectTypeId: type.id },
    })).id;
    blockId = (await prisma.block.create({ data: { projectId, code: `B${S}`, name: `Tower ${S}`, totalFloors: 5 } })).id;
    unitId = (await prisma.unit.create({
      data: {
        projectId, blockId, unitNumber: `RC-${S}`, floorNumber: 1,
        carpetArea: 900, builtUpArea: 1000, superBuiltUpArea: 1200, status: "BOOKED",
      },
    })).id;
    customerId = (await prisma.customer.create({
      data: { customerNo: `CU-RC-${S}`, name: `Clearance test ${S}`, phone: `9${String(Date.now()).slice(-9)}` },
    })).id;
  });

  afterAll(async () => {
    await prisma.receipt.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.paymentDemand.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.unit.deleteMany({ where: { id: unitId } });
    await prisma.block.deleteMany({ where: { id: blockId } });
    await prisma.auditLog.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("clears an electronic receipt on entry, and leaves a cheque pending", async () => {
    const { userId } = await actAs(OWNER);
    const b = await makeBooking();

    const neft = await collect(b.bookingId, b.demandId, 50_000, "NEFT");
    expect(neft.clearedAt).not.toBeNull();
    expect(neft.clearedById).toBe(userId);
    expect(receiptStatus(neft)).toBe("CLEARED");

    const cheque = await collect(b.bookingId, b.demandId, 25_000, "CHEQUE");
    expect(cheque.clearedAt).toBeNull();
    expect(receiptStatus(cheque)).toBe("PENDING_CLEARANCE");
    // Still counted at entry, as before.
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(75_000);

    // An electronic receipt has nothing to clear.
    expect((await clearReceiptAction(neft.id, today())).ok).toBe(false);
  });

  it("clears a cheque once, and refuses a second clear", async () => {
    const { userId } = await actAs(OWNER);
    const b = await makeBooking();
    const cheque = await collect(b.bookingId, b.demandId, 60_000, "CHEQUE");

    const res = await clearReceiptAction(cheque.id, today());
    expect(res).toEqual({ ok: true, data: { receiptNo: cheque.receiptNo } });
    const cleared = await receipt(cheque.id);
    expect(cleared.clearedAt).not.toBeNull();
    expect(cleared.clearedById).toBe(userId);
    expect(receiptStatus(cleared)).toBe("CLEARED");

    const again = await clearReceiptAction(cheque.id, today());
    expect(again.ok).toBe(false);
    expect((await receipt(cheque.id)).clearedAt?.getTime()).toBe(cleared.clearedAt?.getTime());
    // Clearing moves no money.
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(60_000);
  });

  it("refuses a clearance date in the future", async () => {
    await actAs(OWNER);
    const b = await makeBooking();
    const dd = await collect(b.bookingId, b.demandId, 10_000, "DD");
    const res = await clearReceiptAction(dd.id, "2999-01-01");
    expect(res.ok).toBe(false);
    expect((await receipt(dd.id)).clearedAt).toBeNull();
  });

  it("reverses a bounce exactly from the booking and the demand, stepping the demand back", async () => {
    await actAs(OWNER);
    const b = await makeBooking(200_000);
    await collect(b.bookingId, b.demandId, 50_000, "NEFT");
    const cheque = await collect(b.bookingId, b.demandId, 150_000, "CHEQUE");
    expect((await demand(b.demandId)).status).toBe("PAID");
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(200_000);

    const res = await bounceReceiptAction(cheque.id, "Insufficient funds");
    expect(res).toEqual({ ok: true, data: { receiptNo: cheque.receiptNo, reversed: 150_000 } });

    const bounced = await receipt(cheque.id);
    expect(receiptStatus(bounced)).toBe("BOUNCED");
    expect(bounced.bounceReason).toBe("Insufficient funds");
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(50_000);
    const d = await demand(b.demandId);
    expect(n(d.receivedAmount)).toBe(50_000);
    expect(d.status).toBe("PARTIALLY_PAID");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: cheque.id, summary: { contains: "bounced" } } });
    expect(audit?.summary).toContain("₹1,50,000 reversed");
  });

  it("steps a demand back to RAISED, or PENDING if never raised, when nothing stands", async () => {
    await actAs(OWNER);
    const raised = await makeBooking(80_000, true);
    const c1 = await collect(raised.bookingId, raised.demandId, 80_000, "CHEQUE");
    expect((await bounceReceiptAction(c1.id, "Signature mismatch")).ok).toBe(true);
    expect((await demand(raised.demandId)).status).toBe("RAISED");
    expect(n((await demand(raised.demandId)).receivedAmount)).toBe(0);
    expect(n((await booking(raised.bookingId)).receivedAmount)).toBe(0);

    const pending = await makeBooking(80_000, false);
    const c2 = await collect(pending.bookingId, pending.demandId, 30_000, "DD");
    expect((await demand(pending.demandId)).status).toBe("PARTIALLY_PAID");
    expect((await bounceReceiptAction(c2.id, "Stale draft")).ok).toBe(true);
    expect((await demand(pending.demandId)).status).toBe("PENDING");
  });

  it("refuses a double bounce and reverses nothing the second time", async () => {
    await actAs(OWNER);
    const b = await makeBooking(200_000);
    await collect(b.bookingId, b.demandId, 40_000, "UPI");
    const cheque = await collect(b.bookingId, b.demandId, 100_000, "CHEQUE");
    expect((await bounceReceiptAction(cheque.id, "Account closed")).ok).toBe(true);

    const before = { booking: await booking(b.bookingId), demand: await demand(b.demandId) };
    const again = await bounceReceiptAction(cheque.id, "Account closed");
    expect(again.ok).toBe(false);

    const after = { booking: await booking(b.bookingId), demand: await demand(b.demandId) };
    expect(n(after.booking.receivedAmount)).toBe(40_000);
    expect(n(after.booking.receivedAmount)).toBe(n(before.booking.receivedAmount));
    expect(n(after.demand.receivedAmount)).toBe(n(before.demand.receivedAmount));
    expect(after.demand.status).toBe(before.demand.status);
    // A bounced instrument cannot then be cleared either.
    expect((await clearReceiptAction(cheque.id, today())).ok).toBe(false);
  });

  it("refuses to bounce a cheque that has already cleared", async () => {
    await actAs(OWNER);
    const b = await makeBooking(200_000);
    const cheque = await collect(b.bookingId, b.demandId, 120_000, "CHEQUE");
    expect((await clearReceiptAction(cheque.id, today())).ok).toBe(true);

    const res = await bounceReceiptAction(cheque.id, "Late return");
    expect(res.ok).toBe(false);
    const r = await receipt(cheque.id);
    expect(r.bouncedAt).toBeNull();
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(120_000);
    expect(n((await demand(b.demandId)).receivedAmount)).toBe(120_000);
    expect((await demand(b.demandId)).status).toBe("PARTIALLY_PAID");
  });

  it("refuses a bounce without a reason", async () => {
    await actAs(OWNER);
    const b = await makeBooking();
    const cheque = await collect(b.bookingId, b.demandId, 10_000, "CHEQUE");
    expect((await bounceReceiptAction(cheque.id, "   ")).ok).toBe(false);
    expect((await receipt(cheque.id)).bouncedAt).toBeNull();
  });

  it("refuses the sales executive, who lacks sales.receipt.clear", async () => {
    await actAs(OWNER);
    const b = await makeBooking();
    const cheque = await collect(b.bookingId, b.demandId, 70_000, "CHEQUE");

    await actAs(SALES);
    const clear = await clearReceiptAction(cheque.id, today());
    expect(clear).toMatchObject({ ok: false, code: "sales.receipt.clear" });
    const bounce = await bounceReceiptAction(cheque.id, "Insufficient funds");
    expect(bounce).toMatchObject({ ok: false, code: "sales.receipt.clear" });

    const r = await receipt(cheque.id);
    expect(r.clearedAt).toBeNull();
    expect(r.bouncedAt).toBeNull();
    expect(n((await booking(b.bookingId)).receivedAmount)).toBe(70_000);
  });
});
