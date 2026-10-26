import { describe, expect, it } from "vitest";

import {
  advanceRecoveryForPeriod, bikeRentForPeriod, computeFinal, defaultPeriod, parsePayoutSheet,
  payoutImportColumns, riderCodeKey, type PayoutFormula,
} from "@/lib/payouts/compute";
import { MONTHLY_COLUMN_MAP, WEEKLY_COLUMN_MAP } from "../../prisma/masters-seed";

const formula: PayoutFormula = {
  advance: "subtract", bikeRental: "subtract", tds: "subtract",
  pullAdvancesFromSystem: true, pullBikeRentFromSystem: true,
};
const none = { systemAdvance: 0, systemBikeRent: 0 };

describe("reading a company's payout sheet", () => {
  const headers = ["Rider ID", "Total Payout", "Advance Amount", "Bike Rental", "TDS", "Final Payout"];
  const sheet = (rows: string[][]) => ({
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
  });

  it("reads the SOW's weekly columns by the seeded map", () => {
    const parsed = parsePayoutSheet(sheet([["nl 001", "₹12,500", "500", "", "125", "11875"]]), WEEKLY_COLUMN_MAP);
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      row: 2, riderCode: "NL001", totalPayout: 12500, advance: 500, bikeRental: null, tds: 125, finalPayout: 11875, errors: [],
    });
  });

  it("reads the internal staff sheet by its own words", () => {
    const parsed = parsePayoutSheet(
      { headers: ["Employee ID", "Gross Salary", "Advance", "Deductions", "Net Pay"], rows: [{ "Employee ID": "NL005", "Gross Salary": "30000", Advance: "", Deductions: "1200", "Net Pay": "28800" }] },
      MONTHLY_COLUMN_MAP,
    );
    expect(parsed.rows[0]).toMatchObject({ riderCode: "NL005", totalPayout: 30000, advance: null, tds: 1200, finalPayout: 28800 });
    // The map names no bike column, so none is asked for.
    expect(payoutImportColumns(MONTHLY_COLUMN_MAP).map((c) => c.key)).not.toContain("bikeRental");
  });

  it("reports the required columns up front and reads nothing", () => {
    const parsed = parsePayoutSheet({ headers: ["Rider ID", "Advance Amount"], rows: [{ "Rider ID": "NL001", "Advance Amount": "1" }] }, WEEKLY_COLUMN_MAP);
    expect(parsed.missing).toEqual(["Total Payout"]);
    expect(parsed.rows).toEqual([]);
  });

  it("names what is wrong with a row, by the sheet's own column names", () => {
    const parsed = parsePayoutSheet(sheet([["", "lots", "-5", "", "", ""]]), WEEKLY_COLUMN_MAP);
    expect(parsed.rows[0].errors).toEqual([
      "Rider ID is blank",
      'Total Payout: "lots" is not a number',
      "Advance Amount cannot be negative",
    ]);
  });

  it("matches Rider IDs without regard to case or spaces", () => {
    expect(riderCodeKey("nl 001")).toBe("NL001");
    expect(riderCodeKey(" NL001 ")).toBe("NL001");
  });
});

describe("the final payout", () => {
  it("is total minus advance, bike rental and TDS", () => {
    expect(computeFinal({ totalPayout: 10000, advance: 1000, bikeRental: 500, tds: 100 }, formula, none).finalPayout).toBe(8400);
  });

  it("takes the sheet's deduction where the sheet has one, and the system's where it has none", () => {
    const sys = { systemAdvance: 700, systemBikeRent: 350 };
    const sheetWins = computeFinal({ totalPayout: 10000, advance: 1000, bikeRental: 500, tds: 0 }, formula, sys);
    expect(sheetWins.advance).toBe(1000);
    expect(sheetWins.bikeRental).toBe(500);
    const systemFills = computeFinal({ totalPayout: 10000, advance: null, bikeRental: null, tds: 0 }, formula, sys);
    expect(systemFills.advance).toBe(700);
    expect(systemFills.bikeRental).toBe(350);
    expect(systemFills.finalPayout).toBe(8950);
  });

  it("does not fill from the system when Admin has switched that off", () => {
    const off = { ...formula, pullAdvancesFromSystem: false, pullBikeRentFromSystem: false };
    const r = computeFinal({ totalPayout: 10000, advance: null, bikeRental: null, tds: null }, off, { systemAdvance: 700, systemBikeRent: 350 });
    expect(r).toMatchObject({ advance: 0, bikeRental: 0, tds: 0, finalPayout: 10000 });
  });

  it("honours a term set to add or ignore", () => {
    const r = computeFinal({ totalPayout: 10000, advance: 1000, bikeRental: 500, tds: 100 }, { ...formula, advance: "ignore", tds: "add" }, none);
    expect(r.finalPayout).toBe(9600);
    // The ignored figure stays on the line, for the record.
    expect(r.advance).toBe(1000);
  });

  it("never goes below zero", () => {
    expect(computeFinal({ totalPayout: 500, advance: 1000, bikeRental: 0, tds: 0 }, formula, none).finalPayout).toBe(0);
  });

  it("rounds to the paisa", () => {
    expect(computeFinal({ totalPayout: 100.005, advance: 0.001, bikeRental: 0, tds: 0 }, formula, none).finalPayout).toBe(100);
  });
});

describe("bike rent for a period", () => {
  const week = { rentPerWeek: 700, startDate: "2026-01-01", endDate: null };

  it("charges whole weeks of overlap, and at least one", () => {
    expect(bikeRentForPeriod([week], "2026-03-02", "2026-03-08")).toBe(700);
    expect(bikeRentForPeriod([week], "2026-03-01", "2026-03-31")).toBe(700 * 4);
    expect(bikeRentForPeriod([week], "2026-03-02", "2026-03-03")).toBe(700);
  });

  it("charges nothing outside the assignment", () => {
    const ended = { ...week, endDate: "2026-02-28" };
    expect(bikeRentForPeriod([ended], "2026-03-02", "2026-03-08")).toBe(0);
    const later = { ...week, startDate: "2026-04-01" };
    expect(bikeRentForPeriod([later], "2026-03-02", "2026-03-08")).toBe(0);
  });

  it("clips to the days the assignment and the period share", () => {
    const short = { rentPerWeek: 700, startDate: "2026-03-05", endDate: "2026-03-06" };
    expect(bikeRentForPeriod([short], "2026-03-02", "2026-03-15")).toBe(700);
  });

  it("adds up several bikes", () => {
    expect(bikeRentForPeriod([week, { ...week, rentPerWeek: 300 }], "2026-03-02", "2026-03-08")).toBe(1000);
  });
});

describe("advance recovery for a period", () => {
  it("takes each approved advance's per-period amount, capped at what is outstanding", () => {
    const r = advanceRecoveryForPeriod([
      { status: "APPROVED", amount: 5000, recoveredAmount: 4800, recoveryPerPeriod: 1000 },
      { status: "APPROVED", amount: 3000, recoveredAmount: 0, recoveryPerPeriod: 500 },
      { status: "PENDING", amount: 9000, recoveredAmount: 0, recoveryPerPeriod: 9000 },
      { status: "APPROVED", amount: 1000, recoveredAmount: 1000, recoveryPerPeriod: 100 },
    ]);
    expect(r.total).toBe(700);
    expect(r.byAdvance).toEqual([{ index: 0, amount: 200 }, { index: 1, amount: 500 }]);
  });

  it("recovers the whole outstanding when no per-period amount was set", () => {
    expect(advanceRecoveryForPeriod([{ status: "APPROVED", amount: 1500, recoveredAmount: 300, recoveryPerPeriod: null }]).total).toBe(1200);
  });
});

describe("the period a sheet most likely covers", () => {
  it("is the last Monday-to-Sunday week for a weekly company", () => {
    // Wednesday 11 March 2026.
    expect(defaultPeriod("WEEKLY", Date.parse("2026-03-11T09:00:00.000Z"))).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    // A Monday looks back at the week just finished.
    expect(defaultPeriod("WEEKLY", Date.parse("2026-03-09T09:00:00.000Z"))).toEqual({ from: "2026-03-02", to: "2026-03-08" });
  });

  it("is the last calendar month for internal staff", () => {
    expect(defaultPeriod("MONTHLY", Date.parse("2026-03-11T09:00:00.000Z"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(defaultPeriod("MONTHLY", Date.parse("2026-01-05T09:00:00.000Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
