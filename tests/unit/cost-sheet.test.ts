import { describe, expect, it } from "vitest";

import {
  buildCostSheet, buildPaymentSchedule, DEFAULT_MILESTONES,
  type ChargeHeadFacts, type PriceFacts, type UnitFacts,
} from "@/lib/sales/cost-sheet";

const HEADS: ChargeHeadFacts[] = [
  { id: "h1", code: "BASE", name: "Base Price", calcType: "PER_SQFT", defaultValue: 0, taxPct: 5, sortOrder: 10, isMandatory: true },
  { id: "h2", code: "FLOORRISE", name: "Floor Rise", calcType: "PER_SQFT", defaultValue: 25, taxPct: 5, sortOrder: 20, isMandatory: false },
  { id: "h3", code: "PLC", name: "PLC", calcType: "FIXED", defaultValue: 150000, taxPct: 5, sortOrder: 30, isMandatory: false },
  { id: "h4", code: "PARKING", name: "Car Parking", calcType: "FIXED", defaultValue: 350000, taxPct: 18, sortOrder: 40, isMandatory: false },
  { id: "h5", code: "CLUB", name: "Club Membership", calcType: "FIXED", defaultValue: 125000, taxPct: 18, sortOrder: 50, isMandatory: false },
  { id: "h6", code: "STAMP", name: "Stamp Duty", calcType: "PERCENT_OF_BASE", defaultValue: 6.5, taxPct: 0, sortOrder: 90, isMandatory: true },
];

const PRICE: PriceFacts = { baseRate: 7450, floorRise: 25, plcAmount: 150000 };

function unit(over: Partial<UnitFacts> = {}): UnitFacts {
  return {
    unitNumber: "A-0702", floorNumber: 7, superBuiltUpArea: 1655,
    carpetArea: 1120, parkingSlots: 2, plcTag: "CORNER", ...over,
  };
}

const line = (sheet: ReturnType<typeof buildCostSheet>, code: string) =>
  sheet.lines.find((l) => l.code === code);

describe("cost sheet — base price", () => {
  it("multiplies super built-up area by the price-list rate", () => {
    const sheet = buildCostSheet(unit(), PRICE, HEADS);
    expect(sheet.basePrice).toBe(1655 * 7450);
    expect(line(sheet, "BASE")!.amount).toBe(12_329_750);
  });

  it("applies the charge head's own GST rate to the base line", () => {
    const sheet = buildCostSheet(unit(), PRICE, HEADS);
    expect(line(sheet, "BASE")!.taxAmount).toBeCloseTo(616_487.5, 2);
  });
});

describe("cost sheet — charges derived from the unit", () => {
  it("charges floor rise per floor above the first", () => {
    const sheet = buildCostSheet(unit({ floorNumber: 7 }), PRICE, HEADS);
    // ₹25 × 6 floors above the first
    expect(line(sheet, "FLOORRISE")!.rate).toBe(150);
    expect(line(sheet, "FLOORRISE")!.amount).toBe(1655 * 150);
  });

  it("charges no floor rise on the ground floor", () => {
    const sheet = buildCostSheet(unit({ floorNumber: 1 }), PRICE, HEADS);
    expect(line(sheet, "FLOORRISE")).toBeUndefined();
  });

  it("applies PLC only to a unit that carries a PLC tag", () => {
    expect(line(buildCostSheet(unit(), PRICE, HEADS), "PLC")!.amount).toBe(150_000);
    expect(line(buildCostSheet(unit({ plcTag: null }), PRICE, HEADS), "PLC")).toBeUndefined();
  });

  it("prices parking per allotted slot", () => {
    expect(line(buildCostSheet(unit({ parkingSlots: 2 }), PRICE, HEADS), "PARKING")!.amount).toBe(700_000);
    expect(line(buildCostSheet(unit({ parkingSlots: 0 }), PRICE, HEADS), "PARKING")).toBeUndefined();
  });

  it("computes stamp duty on the base price, not on the gross", () => {
    const sheet = buildCostSheet(unit(), PRICE, HEADS);
    expect(line(sheet, "STAMP")!.amount).toBeCloseTo(12_329_750 * 0.065, 2);
    // Guard against the classic mistake of taxing the whole consideration.
    expect(line(sheet, "STAMP")!.amount).toBeLessThan(sheet.subTotal * 0.065);
  });
});

describe("cost sheet — optional charges", () => {
  it("leaves an optional head off unless it is chosen", () => {
    expect(line(buildCostSheet(unit(), PRICE, HEADS), "CLUB")).toBeUndefined();
  });

  it("includes an optional head when chosen", () => {
    const sheet = buildCostSheet(unit(), PRICE, HEADS, { includeOptional: ["CLUB"] });
    expect(line(sheet, "CLUB")!.amount).toBe(125_000);
  });
});

describe("cost sheet — totals", () => {
  it("sums lines and their tax into the total", () => {
    const sheet = buildCostSheet(unit(), PRICE, HEADS);
    const lineSum = sheet.lines.reduce((s, l) => s + l.amount, 0);
    const taxSum = sheet.lines.reduce((s, l) => s + l.taxAmount, 0);
    expect(sheet.subTotal).toBeCloseTo(lineSum, 2);
    expect(sheet.taxAmount).toBeCloseTo(taxSum, 2);
    expect(sheet.totalAmount).toBeCloseTo(lineSum + taxSum, 2);
  });

  it("subtracts the discount from the total", () => {
    const plain = buildCostSheet(unit(), PRICE, HEADS);
    const discounted = buildCostSheet(unit(), PRICE, HEADS, { discountAmount: 250_000 });
    expect(discounted.totalAmount).toBeCloseTo(plain.totalAmount - 250_000, 2);
  });

  it("ignores a negative discount rather than inflating the price", () => {
    const plain = buildCostSheet(unit(), PRICE, HEADS);
    const negative = buildCostSheet(unit(), PRICE, HEADS, { discountAmount: -100_000 });
    expect(negative.totalAmount).toBeCloseTo(plain.totalAmount, 2);
  });
});

describe("payment schedule", () => {
  const bookingDate = new Date("2026-09-01T00:00:00Z");

  it("splits the total across the standard milestones", () => {
    const schedule = buildPaymentSchedule(14_500_000, bookingDate);
    expect(schedule).toHaveLength(DEFAULT_MILESTONES.length);
    expect(schedule[0].amount).toBe(1_450_000);
  });

  it("reconciles exactly to the booking total", () => {
    const total = 14_500_000;
    const sum = buildPaymentSchedule(total, bookingDate).reduce((s, m) => s + m.amount, 0);
    expect(sum).toBe(total);
  });

  it("absorbs rounding drift so an awkward total still reconciles", () => {
    for (const total of [10_000_003.33, 7_777_777.77, 1, 999_999.99]) {
      const sum = buildPaymentSchedule(total, bookingDate).reduce((s, m) => s + m.amount, 0);
      expect(sum).toBeCloseTo(total, 2);
    }
  });

  it("dates the first milestone on the booking date", () => {
    const schedule = buildPaymentSchedule(1_000_000, bookingDate);
    expect(schedule[0].dueDate.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("refuses a plan that does not total 100%", () => {
    expect(() =>
      buildPaymentSchedule(100, bookingDate, [{ label: "Half", percentage: 50, dueInDays: 0 }]),
    ).toThrow(/100%/);
  });
});
