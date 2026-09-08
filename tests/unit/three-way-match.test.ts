import { describe, expect, it } from "vitest";

import { threeWayMatch, isInward, type MatchLine } from "@/lib/inventory";

function line(over: Partial<MatchLine> = {}): MatchLine {
  return {
    itemId: "i1", itemName: "OPC 53 Cement",
    orderedQty: 100, receivedQty: 100, invoicedQty: 100,
    poRate: 400, invoiceRate: 400, ...over,
  };
}

describe("three-way match", () => {
  it("passes when PO, GRN and invoice agree", () => {
    expect(threeWayMatch([line()]).matched).toBe(true);
  });

  it("blocks an invoice billing more than was received", () => {
    const result = threeWayMatch([line({ receivedQty: 80, invoicedQty: 100 })]);
    expect(result.matched).toBe(false);
    expect(result.issues[0]).toMatch(/only 80 was received/i);
  });

  it("blocks an invoice rated above the purchase order", () => {
    const result = threeWayMatch([line({ poRate: 400, invoiceRate: 450 })]);
    expect(result.matched).toBe(false);
    expect(result.issues.join(" ")).toMatch(/against a PO rate/i);
  });

  it("flags receiving more than was ordered", () => {
    const result = threeWayMatch([line({ orderedQty: 100, receivedQty: 120, invoicedQty: 100 })]);
    expect(result.matched).toBe(false);
  });

  it("allows under-billing — that is the vendor's loss, not a control failure", () => {
    expect(threeWayMatch([line({ invoicedQty: 90 })]).matched).toBe(true);
  });

  it("honours a rate tolerance when one is configured", () => {
    const overByHalfPercent = line({ poRate: 60_000, invoiceRate: 60_300 });
    expect(threeWayMatch([overByHalfPercent], 0).matched).toBe(false);
    expect(threeWayMatch([overByHalfPercent], 1).matched).toBe(true);
  });

  it("reports every failing line, not just the first", () => {
    const result = threeWayMatch([
      line({ itemName: "Cement", receivedQty: 50, invoicedQty: 100 }),
      line({ itemName: "Steel", poRate: 100, invoiceRate: 200 }),
    ]);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.join(" ")).toContain("Cement");
    expect(result.issues.join(" ")).toContain("Steel");
  });
});

describe("movement direction", () => {
  it("treats receipts, returns and inbound transfers as inward", () => {
    expect(isInward("GRN_IN")).toBe(true);
    expect(isInward("RETURN_IN")).toBe(true);
    expect(isInward("TRANSFER_IN")).toBe(true);
  });

  it("treats issues and outbound transfers as outward", () => {
    expect(isInward("ISSUE_OUT")).toBe(false);
    expect(isInward("TRANSFER_OUT")).toBe(false);
    expect(isInward("SCRAP")).toBe(false);
  });
});
