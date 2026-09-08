import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCostSheetFor, expireStaleHolds } from "@/lib/sales/service";
import { demoProject, n, prisma, seededUsers, tag } from "./helpers";

describe("cost sheet generation from the price list", () => {
  const suffix = tag();
  let projectId: string;
  let unitId: string;
  let blockId: string;
  const priceListIds: string[] = [];

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;

    const block = await prisma.block.create({
      data: { projectId, code: `TB${suffix.slice(1, 4)}`, name: `Test block ${suffix}`, totalFloors: 10 },
    });
    blockId = block.id;

    const unit = await prisma.unit.create({
      data: {
        projectId, blockId,
        unitNumber: `TU-${suffix}`,
        floorNumber: 7,
        carpetArea: 1120,
        builtUpArea: 1340,
        superBuiltUpArea: 1655,
        parkingSlots: 2,
        plcTag: "CORNER",
        status: "AVAILABLE",
      },
    });
    unitId = unit.id;
  });

  afterAll(async () => {
    await prisma.costSheetLine.deleteMany({ where: { costSheet: { unitId } } });
    await prisma.costSheet.deleteMany({ where: { unitId } });
    await prisma.unitHold.deleteMany({ where: { unitId } });
    await prisma.unit.delete({ where: { id: unitId } }).catch(() => undefined);
    await prisma.block.delete({ where: { id: blockId } }).catch(() => undefined);
    await prisma.priceListItem.deleteMany({ where: { priceListId: { in: priceListIds } } });
    await prisma.priceList.deleteMany({ where: { id: { in: priceListIds } } });
    await prisma.$disconnect();
  });

  it("derives the base price from the active price list", async () => {
    const { sheet, baseRate } = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
    expect(sheet.basePrice).toBeCloseTo(1655 * baseRate, 2);
  });

  it("includes floor rise for a 7th-floor unit", async () => {
    const { sheet } = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
    expect(sheet.lines.some((l) => l.code === "FLOORRISE")).toBe(true);
  });

  it("includes PLC because the unit carries a CORNER tag", async () => {
    const { sheet } = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
    expect(sheet.lines.some((l) => l.code === "PLC")).toBe(true);
  });

  it("prices both allotted parking slots", async () => {
    const { sheet } = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
    const parking = sheet.lines.find((l) => l.code === "PARKING");
    expect(parking?.quantity).toBe(2);
  });

  it("applies a discount to the total", async () => {
    const plain = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
    const cut = await prisma.$transaction((tx) =>
      generateCostSheetFor(tx, unitId, { discountAmount: 500_000 }),
    );
    expect(cut.sheet.totalAmount).toBeCloseTo(plain.sheet.totalAmount - 500_000, 2);
  });

  it("resolves the price list by date, so a past quote keeps its rate", async () => {
    const original = await prisma.priceList.findFirstOrThrow({
      where: { projectId, isActive: true },
      include: { items: true },
    });
    const originalRate = n(original.items[0].baseRate);

    // Publish a dearer version effective from today, closing the old one yesterday.
    const yesterday = new Date(Date.now() - 86_400_000);
    await prisma.priceList.update({
      where: { id: original.id },
      data: { isActive: false, effectiveTo: yesterday },
    });
    const revision = await prisma.priceList.create({
      data: {
        projectId,
        name: `Revision ${suffix}`,
        version: original.version + 1,
        effectiveFrom: new Date(),
        isActive: true,
        items: { create: [{ baseRate: originalRate + 1000, floorRise: 25, plcAmount: 150000 }] },
      },
    });
    priceListIds.push(revision.id);

    try {
      const today = await prisma.$transaction((tx) => generateCostSheetFor(tx, unitId));
      expect(today.baseRate).toBe(originalRate + 1000);

      // A quote dated before the revision must still use the old rate.
      const backdated = await prisma.$transaction((tx) =>
        generateCostSheetFor(tx, unitId, { asOf: new Date(Date.now() - 5 * 86_400_000) }),
      );
      expect(backdated.baseRate).toBe(originalRate);
    } finally {
      await prisma.priceList.update({
        where: { id: revision.id },
        data: { isActive: false, effectiveTo: yesterday },
      });
      await prisma.priceList.update({
        where: { id: original.id },
        data: { isActive: true, effectiveTo: null },
      });
    }
  });
});

describe("unit holds release themselves", () => {
  const suffix = tag();
  let unitId: string;
  let blockId: string;

  beforeAll(async () => {
    const project = await demoProject();
    const block = await prisma.block.create({
      data: { projectId: project.id, code: `HB${suffix.slice(1, 4)}`, name: `Hold block ${suffix}`, totalFloors: 2 },
    });
    blockId = block.id;
    const unit = await prisma.unit.create({
      data: {
        projectId: project.id, blockId, unitNumber: `HU-${suffix}`,
        floorNumber: 1, superBuiltUpArea: 1000, status: "AVAILABLE",
      },
    });
    unitId = unit.id;
  });

  afterAll(async () => {
    await prisma.unitHold.deleteMany({ where: { unitId } });
    await prisma.unit.delete({ where: { id: unitId } }).catch(() => undefined);
    await prisma.block.delete({ where: { id: blockId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("returns an expired hold's unit to the board", async () => {
    const users = await seededUsers();
    await prisma.unitHold.create({
      data: {
        unitId,
        heldById: users.sales.id,
        expiresAt: new Date(Date.now() - 86_400_000), // expired yesterday
        isActive: true,
      },
    });
    await prisma.unit.update({ where: { id: unitId }, data: { status: "HELD" } });

    const released = await prisma.$transaction((tx) => expireStaleHolds(tx));
    expect(released).toBeGreaterThanOrEqual(1);

    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("AVAILABLE");

    const hold = await prisma.unitHold.findFirstOrThrow({ where: { unitId } });
    expect(hold.isActive).toBe(false);
    expect(hold.releaseNote).toMatch(/expired/i);
  });

  it("leaves a live hold alone", async () => {
    const users = await seededUsers();
    await prisma.unitHold.create({
      data: {
        unitId,
        heldById: users.sales.id,
        expiresAt: new Date(Date.now() + 5 * 86_400_000),
        isActive: true,
      },
    });
    await prisma.unit.update({ where: { id: unitId }, data: { status: "HELD" } });

    await prisma.$transaction((tx) => expireStaleHolds(tx));

    const unit = await prisma.unitHold.findFirstOrThrow({
      where: { unitId, isActive: true },
    });
    expect(unit.isActive).toBe(true);
  });

  it("does not take a booked unit back off a booking", async () => {
    // A hold that expires must not disturb a unit that has since been booked.
    await prisma.unit.update({ where: { id: unitId }, data: { status: "BOOKED" } });
    await prisma.unitHold.updateMany({
      where: { unitId, isActive: true },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    await prisma.$transaction((tx) => expireStaleHolds(tx));

    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("BOOKED");
  });
});
