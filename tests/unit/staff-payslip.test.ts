import { describe, expect, it } from "vitest";

import { advanceDueThisMonth, computePayslip, isMonth, monthLabel, monthRange, payableDays } from "@/lib/staff/payslip";
import { payslipBandFigures, payslipListWhere, readPayslipListParams } from "@/lib/staff/list-filters";

describe("the month", () => {
  it("is yyyy-mm, and nothing else", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-10-01")).toBe(false);
  });

  it("spans the first of the month to the first of the next", () => {
    const { from, to } = monthRange("2026-02");
    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("payable days", () => {
  it("counts a present day one, a half day half, an absence nothing", () => {
    expect(payableDays([
      { status: "PRESENT" }, { status: "PRESENT" }, { status: "HALF_DAY" }, { status: "ABSENT" },
    ])).toBe(2.5);
    expect(payableDays([])).toBe(0);
  });
});

describe("the payslip arithmetic", () => {
  it("is gross less advance less deductions", () => {
    expect(computePayslip({ gross: "25,000", advance: 2000, deductions: "500.50" })).toEqual({
      gross: 25000, advance: 2000, deductions: 500.5, netPay: 22499.5,
    });
  });

  it("refuses a slip that pays less than nothing, or a gross of nothing", () => {
    expect(() => computePayslip({ gross: 1000, advance: 800, deductions: 300 })).toThrow(/more than the gross/);
    expect(() => computePayslip({ gross: 0, advance: 0, deductions: 0 })).toThrow(/more than zero/);
    expect(() => computePayslip({ gross: "lots", advance: 0, deductions: 0 })).toThrow(/Gross/);
    expect(() => computePayslip({ gross: 1000, advance: -5, deductions: 0 })).toThrow(/Advance/);
  });

  it("recovers each advance by its per-period amount, capped at what is left", () => {
    expect(advanceDueThisMonth([
      { amount: 5000, recoveredAmount: 4500, recoveryPerPeriod: 1000 },
      { amount: 3000, recoveredAmount: 0, recoveryPerPeriod: 1000 },
      // No schedule set: the whole balance is due.
      { amount: 200, recoveredAmount: 0, recoveryPerPeriod: null },
    ])).toBe(1700);
    expect(advanceDueThisMonth([])).toBe(0);
  });
});

describe("the payslip list", () => {
  it("reads month, employee and search, dropping a month that is not one", () => {
    expect(readPayslipListParams({ month: "2026-10", employee: "e1", q: " x " })).toEqual({ month: "2026-10", employee: "e1", q: "x" });
    expect(readPayslipListParams({ month: "October" }).month).toBe("");
    const where = payslipListWhere({ month: "2026-10", employee: "e1", q: "" }) as Record<string, unknown>;
    expect(where).toEqual({ month: "2026-10", employeeId: "e1" });
  });

  it("sums the band", () => {
    const f = payslipBandFigures([{ gross: 1000, advance: 100, deductions: 50, netPay: 850 }, { gross: 2000, advance: 0, deductions: 0, netPay: 2000 }]);
    const read = (label: string) => f.find((x) => x.label === label)?.value;
    expect(read("Payslips")).toBe("2");
    expect(read("Gross")).toBe("₹3,000");
    expect(read("Net pay")).toBe("₹2,850");
  });
});
