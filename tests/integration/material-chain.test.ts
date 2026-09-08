import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postGrnToStock } from "@/lib/material/grn-posting";
import { cleanupItemAndStore, demoProject, makeItemAndStore, n, prisma, seededUsers, tag } from "./helpers";

/**
 * The controlled chain, end to end:
 * approved indent → purchase order → part receipt → stock → second receipt → closed.
 */
describe("indent → PO → GRN → stock", () => {
  const suffix = tag();
  let itemId: string;
  let storeId: string;
  let poId: string;
  let poItemId: string;
  let indentId: string;
  const grnIds: string[] = [];

  beforeAll(async () => {
    const [{ item, store }, users, project, vendor] = await Promise.all([
      makeItemAndStore(suffix),
      seededUsers(),
      demoProject(),
      prisma.vendor.findFirst({ where: { status: "ACTIVE" } }),
    ]);
    if (!vendor) throw new Error("Seed a vendor first.");
    itemId = item.id;
    storeId = store.id;

    const indent = await prisma.indent.create({
      data: {
        indentNo: `IND/TEST/${suffix}`,
        projectId: project.id,
        raisedById: users.supervisor.id,
        requiredByDate: new Date(Date.now() + 7 * 86_400_000),
        estimatedValue: 50_000,
        status: "ADMIN_APPROVED",
        items: {
          create: [{ itemId, requestedQty: 100, approvedQty: 100, toPurchaseQty: 100, estimatedRate: 500 }],
        },
      },
    });
    indentId = indent.id;

    const po = await prisma.purchaseOrder.create({
      data: {
        poNo: `PO/TEST/${suffix}`,
        projectId: project.id,
        vendorId: vendor.id,
        createdById: users.store.id,
        subTotal: 50_000,
        taxAmount: 9_000,
        totalAmount: 59_000,
        status: "APPROVED",
        items: {
          create: [{ itemId, indentId: indent.id, orderedQty: 100, rate: 500, taxPct: 18, amount: 59_000 }],
        },
      },
      include: { items: true },
    });
    poId = po.id;
    poItemId = po.items[0].id;

    // First delivery: 60 arrive, 5 of them rejected.
    const grn1 = await prisma.grn.create({
      data: {
        grnNo: `GRN/TEST/${suffix}/1`,
        poId: po.id, vendorId: vendor.id, storeId: store.id,
        receivedById: users.store.id, status: "INSPECTED",
        items: {
          create: [{
            poItemId, itemId, receivedQty: 60, acceptedQty: 55, rejectedQty: 5,
            shortQty: 0, rate: 500, rejectionReason: "Damaged in transit",
          }],
        },
      },
    });
    grnIds.push(grn1.id);

    // Second delivery: the balance 45, at a higher rate.
    const grn2 = await prisma.grn.create({
      data: {
        grnNo: `GRN/TEST/${suffix}/2`,
        poId: po.id, vendorId: vendor.id, storeId: store.id,
        receivedById: users.store.id, status: "INSPECTED",
        items: {
          create: [{ poItemId, itemId, receivedQty: 45, acceptedQty: 45, rejectedQty: 0, shortQty: 0, rate: 600 }],
        },
      },
    });
    grnIds.push(grn2.id);
  });

  afterAll(async () => {
    await prisma.grn.deleteMany({ where: { id: { in: grnIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: poId } });
    await prisma.indent.deleteMany({ where: { id: indentId } });
    await cleanupItemAndStore(itemId, storeId);
    await prisma.$disconnect();
  });

  it("posts only the accepted quantity, leaving rejected stock out", async () => {
    const result = await prisma.$transaction((tx) => postGrnToStock(tx, grnIds[0], null));
    expect(result.postedLines).toBe(1);
    expect(result.totalAccepted).toBe(55); // not the 60 received
  });

  it("moves the PO to partially received", async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(po.status).toBe("PARTIALLY_RECEIVED");
  });

  it("advances the PO line by what was accepted, not what arrived", async () => {
    const line = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: poItemId } });
    expect(n(line.receivedQty)).toBe(55);
  });

  it("stocks the accepted quantity at the receipt rate", async () => {
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(55);
    expect(n(balance.avgRate)).toBe(500);
  });

  it("blends the second receipt's higher rate into the average", async () => {
    const result = await prisma.$transaction((tx) => postGrnToStock(tx, grnIds[1], null));
    expect(result.poStatus).toBe("RECEIVED");

    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(100);
    // (55 × 500 + 45 × 600) / 100
    expect(n(balance.avgRate)).toBe(545);
    expect(n(balance.value)).toBe(54_500);
  });

  it("marks a posted receipt as POSTED", async () => {
    const grn = await prisma.grn.findUniqueOrThrow({ where: { id: grnIds[0] } });
    expect(grn.status).toBe("POSTED");
  });

  it("refuses to post a receipt twice", async () => {
    await expect(
      prisma.$transaction((tx) => postGrnToStock(tx, grnIds[0], null)),
    ).rejects.toThrow();
  });

  it("keeps 5 rejected units permanently out of the ledger", async () => {
    const sum = await prisma.stockLedger.aggregate({
      where: { itemId },
      _sum: { quantity: true },
    });
    const received = 60 + 45;
    expect(received - n(sum._sum.quantity)).toBe(5);
  });

  it("writes one ledger row per posted line", async () => {
    expect(await prisma.stockLedger.count({ where: { itemId } })).toBe(2);
  });
});
