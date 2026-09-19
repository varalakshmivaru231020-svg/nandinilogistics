import { describe, expect, it } from "vitest";

import { dateFrom, integerFrom, numberFrom } from "@/lib/parse-input";

describe("numberFrom", () => {
  it("keeps the number out of what the design's placeholder invites", () => {
    expect(numberFrom("4.2 acres")).toBe(4.2);
    expect(numberFrom("2 towers")).toBe(2);
    expect(numberFrom("1,200")).toBe(1200);
    expect(numberFrom(" 456 ")).toBe(456);
  });

  it("leaves a blank field alone rather than reading it as zero", () => {
    expect(numberFrom("")).toBeUndefined();
    expect(numberFrom("   ")).toBeUndefined();
    expect(numberFrom(null)).toBeUndefined();
    expect(numberFrom(undefined)).toBeUndefined();
  });

  it("reports text with no number in it", () => {
    expect(numberFrom("acres")).toBeNull();
    expect(numberFrom("—")).toBeNull();
  });
});

describe("integerFrom", () => {
  it("rounds, so 18.5 floors is 19 and not a validation failure", () => {
    expect(integerFrom("18.5")).toBe(19);
    expect(integerFrom("18 floors")).toBe(18);
    expect(integerFrom("")).toBeUndefined();
    expect(integerFrom("none")).toBeNull();
  });
});

describe("dateFrom", () => {
  it("reads the design's own spelling", () => {
    expect(dateFrom("01 Apr 2027")?.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(dateFrom("1 April 2027")?.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(dateFrom("31 Dec 2029")?.toISOString().slice(0, 10)).toBe("2029-12-31");
  });

  it("reads what a date input posts", () => {
    expect(dateFrom("2027-04-01")?.toISOString().slice(0, 10)).toBe("2027-04-01");
  });

  it("reads a slashed date day-first, as these screens do everywhere else", () => {
    expect(dateFrom("01/04/2027")?.toISOString().slice(0, 10)).toBe("2027-04-01");
  });

  it("leaves blank alone and reports nonsense", () => {
    expect(dateFrom("")).toBeUndefined();
    expect(dateFrom("soon")).toBeNull();
    expect(dateFrom("31 Feb 2027")).toBeNull();
    expect(dateFrom("01 Xyz 2027")).toBeNull();
  });
});

describe("dateFrom with no year", () => {
  const today = new Date(Date.UTC(2026, 8, 19)); // 19 Sep 2026

  it("reads the delivery-due example and takes the next one round", () => {
    expect(dateFrom("Due 14 Sep", today)?.toISOString().slice(0, 10)).toBe("2027-09-14");
    expect(dateFrom("25 Sep", today)?.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(dateFrom("14 Jan", today)?.toISOString().slice(0, 10)).toBe("2027-01-14");
  });

  it("counts today itself as due today, not a year away", () => {
    expect(dateFrom("19 Sep", today)?.toISOString().slice(0, 10)).toBe("2026-09-19");
  });

  it("still refuses a month that is not one", () => {
    expect(dateFrom("14 Sept-ish", today)).toBeNull();
  });
});
