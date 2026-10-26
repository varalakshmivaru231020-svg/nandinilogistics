import { describe, expect, it } from "vitest";

import { checkPayment, invoiceStatusOf, outstandingOf, receivedOf } from "@/lib/accounts/status";
import { invoiceBandFigures, invoiceListWhere, readInvoiceListParams } from "@/lib/accounts/list-filters";

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const DAY = 86_400_000;
const pay = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

describe("where an invoice stands", () => {
  const due = new Date(NOW + 5 * DAY);

  it("is raised until it is sent, with nothing received", () => {
    expect(invoiceStatusOf({ amount: 1000, dueDate: due, sent: false }, [], NOW)).toBe("RAISED");
    expect(invoiceStatusOf({ amount: 1000, dueDate: due, sent: true }, [], NOW)).toBe("SENT");
  });

  it("is partially paid once something is in, and paid once everything is", () => {
    expect(invoiceStatusOf({ amount: 1000, dueDate: due, sent: true }, pay(400), NOW)).toBe("PARTIALLY_PAID");
    expect(invoiceStatusOf({ amount: 1000, dueDate: due, sent: true }, pay(400, 600), NOW)).toBe("PAID");
    // Paid is paid, whatever the due date says.
    expect(invoiceStatusOf({ amount: 1000, dueDate: new Date(NOW - 30 * DAY), sent: true }, pay(1000), NOW)).toBe("PAID");
  });

  it("is overdue from the day after the due date, until it is settled", () => {
    const yesterday = new Date(NOW - DAY);
    expect(invoiceStatusOf({ amount: 1000, dueDate: yesterday, sent: true }, [], NOW)).toBe("OVERDUE");
    expect(invoiceStatusOf({ amount: 1000, dueDate: yesterday, sent: true }, pay(500), NOW)).toBe("OVERDUE");
    // Due today is not yet overdue.
    const today = new Date(NOW - 3 * 3_600_000);
    expect(invoiceStatusOf({ amount: 1000, dueDate: today, sent: true }, [], NOW)).toBe("SENT");
    // Without a due date nothing is ever overdue.
    expect(invoiceStatusOf({ amount: 1000, dueDate: null, sent: true }, [], NOW)).toBe("SENT");
  });

  it("adds payments to the paisa and never reports a negative outstanding", () => {
    expect(receivedOf(pay(0.1, 0.2))).toBe(0.3);
    expect(outstandingOf(100, pay(60, 50))).toBe(0);
    expect(outstandingOf("250.50", pay(100))).toBe(150.5);
  });
});

describe("recording a payment", () => {
  it("needs a positive amount within what is outstanding, on a real day", () => {
    expect(() => checkPayment({ amount: 0, paidOn: "2026-10-01" }, 100)).toThrow(/amount/);
    expect(() => checkPayment({ amount: 101, paidOn: "2026-10-01" }, 100)).toThrow(/outstanding/);
    expect(() => checkPayment({ amount: 50, paidOn: "yesterday" }, 100)).toThrow(/day/);
    expect(() => checkPayment({ amount: 100, paidOn: "2026-10-01" }, 100)).not.toThrow();
  });
});

describe("the invoice list", () => {
  it("reads the screen's parameters, dropping a status it does not know", () => {
    const p = readInvoiceListParams({ company: "c1", status: "OVERDUE", from: "2026-10-01", to: "2026-02-31", q: " LD " });
    expect(p).toEqual({ company: "c1", status: "OVERDUE", from: "2026-10-01", to: "", q: "LD" });
    expect(readInvoiceListParams({ status: "LATE" }).status).toBe("");
  });

  it("builds the where the page and the export share", () => {
    const where = invoiceListWhere({ company: "c1", status: "PAID", from: "2026-10-01", to: "", q: "inv" }) as Record<string, unknown>;
    expect(where.companyId).toBe("c1");
    expect(where.status).toBe("PAID");
    expect(where.invoiceDate).toEqual({ gte: new Date("2026-10-01T00:00:00.000Z") });
    expect(Array.isArray(where.OR)).toBe(true);
    expect(invoiceListWhere({ company: "", status: "", from: "", to: "", q: "" })).toEqual({});
  });

  it("sums the band from amounts and payments", () => {
    const f = invoiceBandFigures([
      { amount: 1000, status: "PAID", payments: pay(1000) },
      { amount: 2000, status: "OVERDUE", payments: pay(500) },
      { amount: 500, status: "SENT", payments: [] },
    ]);
    const read = (label: string) => f.find((x) => x.label === label)?.value;
    expect(read("Invoices")).toBe("3");
    expect(read("Raised")).toBe("₹3,500");
    expect(read("Received")).toBe("₹1,500");
    expect(read("Outstanding")).toBe("₹2,000");
    expect(read("Overdue")).toBe("₹1,500");
    expect(read("Paid in full")).toBe("1");
  });
});
