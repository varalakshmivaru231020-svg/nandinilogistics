import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postStockMovement, onHand, InsufficientStockError } from "@/lib/inventory";
import { cleanupItemAndStore, makeItemAndStore, n, prisma, tag } from "./helpers";

describe("stock posting and weighted-average valuation", () => {
  const suffix = tag();
  let itemId: string;
  let storeId: string;

  beforeAll(async () => {
    const { item, store } = await makeItemAndStore(suffix);
    itemId = item.id;
    storeId = store.id;
  });

  afterAll(async () => {
    await cleanupItemAndStore(itemId, storeId);
    await prisma.$disconnect();
  });

  const base = () => ({ itemId, storeId, refType: "TEST", refId: "test" });

  it("values the first receipt at its own rate", async () => {
    await prisma.$transaction((tx) =>
      postStockMovement(tx, { ...base(), txnType: "GRN_IN", quantity: 100, rate: 400 }),
    );
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(100);
    expect(n(balance.avgRate)).toBe(400);
    expect(n(balance.value)).toBe(40_000);
  });

  it("blends a second receipt into the average rather than replacing it", async () => {
    await prisma.$transaction((tx) =>
      postStockMovement(tx, { ...base(), txnType: "GRN_IN", quantity: 100, rate: 500 }),
    );
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(200);
    // (100 × 400 + 100 × 500) / 200
    expect(n(balance.avgRate)).toBe(450);
    expect(n(balance.value)).toBe(90_000);
  });

  it("values an issue at the average and leaves the average untouched", async () => {
    const movement = await prisma.$transaction((tx) =>
      postStockMovement(tx, { ...base(), txnType: "ISSUE_OUT", quantity: 50 }),
    );
    expect(movement.value).toBe(22_500);

    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(150);
    expect(n(balance.avgRate)).toBe(450);
  });

  it("refuses to drive a balance negative", async () => {
    await expect(
      prisma.$transaction((tx) =>
        postStockMovement(tx, { ...base(), txnType: "ISSUE_OUT", quantity: 10_000 }),
      ),
    ).rejects.toThrow(InsufficientStockError);
  });

  it("leaves the balance untouched after a refused movement", async () => {
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(balance.quantity)).toBe(150);
  });

  it("allows a negative adjustment for a physical audit correction", async () => {
    await prisma.$transaction((tx) =>
      postStockMovement(tx, { ...base(), txnType: "ADJUSTMENT", quantity: -10 }),
    );
    const { quantity } = await onHand(prisma, itemId, storeId);
    expect(quantity).toBe(140);
  });

  it("writes one immutable ledger row per successful movement", async () => {
    const rows = await prisma.stockLedger.count({ where: { itemId } });
    expect(rows).toBe(4);
  });

  it("keeps the ledger reconciled to the balance", async () => {
    const sum = await prisma.stockLedger.aggregate({
      where: { itemId },
      _sum: { quantity: true },
    });
    const balance = await prisma.stockBalance.findUniqueOrThrow({
      where: { itemId_storeId: { itemId, storeId } },
    });
    expect(n(sum._sum.quantity)).toBe(n(balance.quantity));
  });

  it("signs outward movements negative and inward positive", async () => {
    const rows = await prisma.stockLedger.findMany({
      where: { itemId },
      select: { txnType: true, quantity: true },
    });
    for (const r of rows) {
      if (r.txnType === "GRN_IN") expect(n(r.quantity)).toBeGreaterThan(0);
      if (r.txnType === "ISSUE_OUT") expect(n(r.quantity)).toBeLessThan(0);
    }
  });
});
