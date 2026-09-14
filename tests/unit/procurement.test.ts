import { describe, expect, it } from "vitest";

import {
  indentEstimatedValue, isIndentEditable, isPoEditable, mayEditIndentAs, poLineChangeProblem,
  poTotals, priceLine, rupeesInWords,
} from "@/lib/material/procurement";

describe("purchase order pricing", () => {
  it("discounts before tax", () => {
    const l = priceLine({ orderedQty: 20, rate: 100, discountPct: 10, taxPct: 18 });
    expect(l.net).toBeCloseTo(1800);
    expect(l.tax).toBeCloseTo(324);
    expect(l.total).toBeCloseTo(2124);
  });

  it("adds other charges after tax, and none of the tax on them", () => {
    const t = poTotals(
      [
        { orderedQty: 20, rate: 100, discountPct: 10, taxPct: 18 },
        { orderedQty: 5, rate: 200, discountPct: 0, taxPct: 5 },
      ],
      50,
    );
    expect(t.subTotal).toBeCloseTo(2800);
    expect(t.taxAmount).toBeCloseTo(374);
    expect(t.totalAmount).toBeCloseTo(3224);
  });

  it("is zero for no lines", () => {
    expect(poTotals([], 0)).toEqual({ subTotal: 0, taxAmount: 0, totalAmount: 0 });
  });
});

describe("indent valuation", () => {
  it("is requested quantity at the estimated rate, summed", () => {
    expect(
      indentEstimatedValue([
        { requestedQty: 20, estimatedRate: 450 },
        { requestedQty: 3, estimatedRate: 1000 },
      ]),
    ).toBe(12_000);
  });
});

describe("purchase order editability", () => {
  const unapproved = {
    status: "DRAFT", pmApprovedAt: null, adminApprovedAt: null, approvedAt: null,
    pmApprovedById: null, adminApprovedById: null, approvedById: null,
  };

  it("allows a draft and an order waiting on its first approval", () => {
    expect(isPoEditable(unapproved)).toBe(true);
    expect(isPoEditable({ ...unapproved, status: "PENDING_PM_APPROVAL" })).toBe(true);
    expect(isPoEditable({ ...unapproved, status: "PENDING_APPROVAL" })).toBe(true);
  });

  it("refuses once any approval is recorded, whatever the status says", () => {
    expect(isPoEditable({ ...unapproved, status: "PENDING_PM_APPROVAL", pmApprovedAt: new Date() })).toBe(false);
    expect(isPoEditable({ ...unapproved, pmApprovedById: "u1" })).toBe(false);
    expect(isPoEditable({ ...unapproved, approvedAt: "2026-01-01" })).toBe(false);
  });

  it("refuses every later status", () => {
    for (const status of ["PENDING_ADMIN_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"]) {
      expect(isPoEditable({ ...unapproved, status }), status).toBe(false);
    }
  });

  it("guards received quantities on each line", () => {
    const fresh = { itemId: "a", receivedQty: 0, receiptCount: 0 };
    const received = { itemId: "a", receivedQty: 4, receiptCount: 1 };
    expect(poLineChangeProblem(fresh, null)).toBeNull();
    expect(poLineChangeProblem(fresh, { itemId: "b", orderedQty: 1 })).toBeNull();
    expect(poLineChangeProblem(received, null)).toMatch(/cannot be removed/);
    expect(poLineChangeProblem(received, { itemId: "b", orderedQty: 10 })).toMatch(/item cannot change/);
    expect(poLineChangeProblem(received, { itemId: "a", orderedQty: 3 })).toMatch(/below the 4/);
    expect(poLineChangeProblem(received, { itemId: "a", orderedQty: 4 })).toBeNull();
  });
});

describe("indent editability", () => {
  it("allows a draft or submitted indent with no approval step", () => {
    expect(isIndentEditable({ status: "DRAFT", approvalCount: 0 })).toBe(true);
    expect(isIndentEditable({ status: "SUBMITTED", approvalCount: 0 })).toBe(true);
  });

  it("refuses once an approval step exists, or at any later status", () => {
    expect(isIndentEditable({ status: "SUBMITTED", approvalCount: 1 })).toBe(false);
    for (const status of ["PM_APPROVED", "ADMIN_APPROVED", "ORDERED", "REJECTED", "CANCELLED", "CLOSED"]) {
      expect(isIndentEditable({ status, approvalCount: 0 }), status).toBe(false);
    }
  });

  it("is the raiser's to edit, or someone who sees every indent", () => {
    expect(mayEditIndentAs({ raisedById: "u1" }, { id: "u1", hasViewAll: false })).toBe(true);
    expect(mayEditIndentAs({ raisedById: "u1" }, { id: "u2", hasViewAll: true })).toBe(true);
    expect(mayEditIndentAs({ raisedById: "u1" }, { id: "u2", hasViewAll: false })).toBe(false);
  });
});

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(rupeesInWords(12_345_678)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    );
    expect(rupeesInWords(120_050.5)).toBe("Rupees One Lakh Twenty Thousand Fifty and Fifty Paise Only");
  });

  it("handles zero and round figures", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(100_000)).toBe("Rupees One Lakh Only");
    expect(rupeesInWords(1_000_000_000)).toBe("Rupees One Hundred Crore Only");
  });
});
