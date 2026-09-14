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
import { prisma, tag } from "./helpers";

import { createBookingAction } from "@/app/(app)/sales/bookings/actions";

bindCookieBox(cookieBox);

/**
 * A unit blocked from sale cannot be booked — not even when a cost sheet was
 * prepared for it before it was blocked. Nothing is written when refused.
 */
describe("booking refuses a unit blocked from sale", () => {
  const S = tag().toUpperCase();
  let projectId: string;
  let unitId: string;
  let customerId: string;
  let costSheetId: string;

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    projectId = (await prisma.project.create({ data: { code: `BB${S}`.slice(0, 20), name: `Blocked booking ${S}`, projectTypeId: type.id } })).id;
    const blockId = (await prisma.block.create({ data: { projectId, code: `B${S}`, name: `Tower ${S}`, totalFloors: 10 } })).id;
    unitId = (await prisma.unit.create({
      data: {
        projectId, blockId, unitNumber: `BB-${S}`, floorNumber: 2,
        carpetArea: 900, builtUpArea: 1000, superBuiltUpArea: 1200, status: "AVAILABLE",
      },
    })).id;
    costSheetId = (await prisma.costSheet.create({
      data: {
        costSheetNo: `CS-BB-${S}`, unitId, baseRate: 7000,
        subTotal: 8_400_000, taxAmount: 0, totalAmount: 8_400_000,
      },
    })).id;
    customerId = (await prisma.customer.create({
      data: { customerNo: `CUST-BB-${S}`, name: `Blocked booking buyer ${S}`, phone: `9${String(Date.now()).slice(-9)}` },
    })).id;

    // Blocked after the cost sheet was prepared.
    await prisma.unit.update({ where: { id: unitId }, data: { status: "BLOCKED" } });
  });

  afterAll(async () => {
    const bookings = await prisma.booking.findMany({ where: { unitId }, select: { id: true } });
    await prisma.paymentDemand.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await prisma.booking.deleteMany({ where: { unitId } });
    await prisma.costSheet.deleteMany({ where: { id: costSheetId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.unit.deleteMany({ where: { id: unitId } });
    await prisma.block.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses, names the block, and writes no booking", async () => {
    await actAs("owner@nninfra.example");
    const res = await createBookingAction(costSheetId, customerId, null);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/blocked from sale/i);

    expect(await prisma.booking.count({ where: { unitId } })).toBe(0);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe("BLOCKED");
  });

  it("books the same unit once it is unblocked", async () => {
    await prisma.unit.update({ where: { id: unitId }, data: { status: "AVAILABLE" } });
    await actAs("owner@nninfra.example");
    const res = await createBookingAction(costSheetId, customerId, null);

    expect(res.ok).toBe(true);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe("BOOKED");
  });
});
