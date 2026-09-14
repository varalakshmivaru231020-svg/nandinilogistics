import { describe, expect, it } from "vitest";

import {
  bookingOutstanding, chargeLineTotal, demandFigures, discountState, indentLineAmount, indentLinesTotal,
  invoiceSettlement, issueTotals, place, quoteExpired, roundMoney, scheduleTotals, taxByRate,
} from "@/components/print/figures";
import { rupeesInWords } from "@/lib/material/procurement";

describe("place", () => {
  it("joins only the parts that carry text", () => {
    expect(place(["12 MG Road", null, "  ", "Bengaluru", undefined, "560001"])).toBe("12 MG Road, Bengaluru, 560001");
    expect(place([null, ""])).toBe("");
  });
});

describe("roundMoney", () => {
  it("rounds to the paisa without float drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});

describe("invoiceSettlement", () => {
  const payments = [
    { id: "c", paymentDate: "2026-03-10T00:00:00Z", createdAt: "2026-03-10T09:00:00Z", amount: 25_000 },
    { id: "a", paymentDate: "2026-02-01T00:00:00Z", createdAt: "2026-02-01T09:00:00Z", amount: 40_000.5 },
    { id: "b", paymentDate: "2026-03-10T00:00:00Z", createdAt: "2026-03-10T08:00:00Z", amount: 10_000 },
  ];

  it("counts only earlier payments as paid before, ordering same-day payments by entry", () => {
    expect(invoiceSettlement(100_000, payments, "a")).toEqual({
      invoiceTotal: 100_000, paidBefore: 0, thisPayment: 40_000.5, paidToDate: 40_000.5, balanceAfter: 59_999.5,
    });
    expect(invoiceSettlement(100_000, payments, "b").paidBefore).toBe(40_000.5);
    expect(invoiceSettlement(100_000, payments, "c")).toEqual({
      invoiceTotal: 100_000, paidBefore: 50_000.5, thisPayment: 25_000, paidToDate: 75_000.5, balanceAfter: 24_999.5,
    });
  });

  it("never shows a negative balance for an overpaid invoice", () => {
    expect(invoiceSettlement(50_000, payments, "c").balanceAfter).toBe(0);
  });

  it("refuses a payment that does not belong to the invoice", () => {
    expect(() => invoiceSettlement(1, payments, "zzz")).toThrow();
  });
});

describe("demand figures", () => {
  it("gives the balance still payable", () => {
    expect(demandFigures({ amount: 500_000, taxAmount: 25_000, totalAmount: 525_000, receivedAmount: 200_000 })).toEqual({
      amount: 500_000, tax: 25_000, total: 525_000, received: 200_000, balance: 325_000,
    });
  });

  it("floors an overpaid demand at nil", () => {
    expect(demandFigures({ amount: 100, taxAmount: 5, totalAmount: 105, receivedAmount: 150 }).balance).toBe(0);
  });

  it("totals a schedule, summing balances per demand so an overpayment cannot mask a shortfall", () => {
    const totals = scheduleTotals([
      { amount: 100, taxAmount: 5, totalAmount: 105, receivedAmount: 150 },
      { amount: 200.1, taxAmount: 10.2, totalAmount: 210.3, receivedAmount: 10 },
    ]);
    expect(totals).toEqual({ amount: 300.1, tax: 15.2, total: 315.3, received: 160, balance: 200.3 });
  });

  it("gives a booking's outstanding, floored at nil", () => {
    expect(bookingOutstanding(1_000_000, 250_000)).toBe(750_000);
    expect(bookingOutstanding(100, 120)).toBe(0);
  });
});

describe("cost sheet figures", () => {
  const lines = [
    { amount: 5_000_000, taxPct: 5, taxAmount: 250_000 },
    { amount: 300_000, taxPct: 18, taxAmount: 54_000 },
    { amount: 100_000, taxPct: 5, taxAmount: 5_000 },
    { amount: 50_000, taxPct: 0, taxAmount: 0 },
  ];

  it("totals a line as amount plus its GST", () => {
    expect(chargeLineTotal(lines[1])).toBe(354_000);
  });

  it("groups GST by rate, highest first, leaving out untaxed lines", () => {
    expect(taxByRate(lines)).toEqual([
      { rate: 18, taxable: 300_000, tax: 54_000 },
      { rate: 5, taxable: 5_100_000, tax: 255_000 },
    ]);
  });

  it("reads the discount state the way the screen does", () => {
    expect(discountState(0, null)).toBe("none");
    expect(discountState(10_000, null)).toBe("pending");
    expect(discountState(10_000, "2026-01-01T00:00:00Z")).toBe("approved");
  });

  it("expires an unbooked quote after its validity, never a booked one", () => {
    const now = new Date("2026-06-01T00:00:00Z").getTime();
    expect(quoteExpired("2026-05-31T00:00:00Z", false, now)).toBe(true);
    expect(quoteExpired("2026-06-02T00:00:00Z", false, now)).toBe(false);
    expect(quoteExpired("2026-05-31T00:00:00Z", true, now)).toBe(false);
    expect(quoteExpired(null, false, now)).toBe(false);
  });
});

describe("indent and issue figures", () => {
  it("values an indent line at the approved quantity once there is one", () => {
    expect(indentLineAmount({ requestedQty: 60, approvedQty: 50, estimatedRate: 410.5 })).toBe(20_525);
    expect(indentLineAmount({ requestedQty: 60, approvedQty: null, estimatedRate: 410.5 })).toBe(24_630);
    expect(indentLinesTotal([
      { requestedQty: 60, approvedQty: 50, estimatedRate: 410.5 },
      { requestedQty: 2.5, approvedQty: null, estimatedRate: 1_000 },
    ])).toBe(23_025);
  });

  it("totals an issue slip, counting outstanding per line", () => {
    expect(issueTotals([
      { issuedQty: 10.125, returnedQty: 2, value: 1_012.5 },
      { issuedQty: 5, returnedQty: 7, value: 500 },
    ])).toEqual({ issued: 15.125, returned: 9, outstanding: 8.125, value: 1_512.5 });
  });
});

describe("amount in words on the printed documents", () => {
  it("spells a demand balance with paise in Indian units", () => {
    expect(rupeesInWords(325_000.75)).toBe("Rupees Three Lakh Twenty Five Thousand and Seventy Five Paise Only");
  });
});
