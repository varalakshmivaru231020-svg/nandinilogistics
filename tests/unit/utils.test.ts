import { describe, expect, it } from "vitest";

import { money, moneyShort, qty, num, formatDate, daysBetween, titleFromCode, cn } from "@/lib/utils";

describe("money formatting (Indian numbering)", () => {
  it("groups in lakhs and crores, not thousands", () => {
    // 12,34,567 — not 1,234,567
    expect(money(1234567)).toContain("12,34,567");
  });

  it("rounds to whole rupees by default", () => {
    expect(money(1234.56)).not.toContain(".");
  });

  it("keeps paise when asked", () => {
    expect(money(1234.56, true)).toContain(".56");
  });

  it("treats null and undefined as zero rather than crashing", () => {
    expect(money(null)).toContain("0");
    expect(money(undefined)).toContain("0");
  });

  it("shows a dash for a value that is not a number", () => {
    expect(money("not-a-number")).toBe("—");
  });
});

describe("short money for dashboard tiles", () => {
  it("uses crores above a crore", () => {
    expect(moneyShort(185_000_000)).toBe("₹18.50 Cr");
  });

  it("uses lakhs between a lakh and a crore", () => {
    expect(moneyShort(1_250_000)).toBe("₹12.50 L");
  });

  it("shows plain rupees below a lakh", () => {
    expect(moneyShort(45_000)).toBe("₹45,000");
  });

  it("handles negatives without losing the sign", () => {
    expect(moneyShort(-15_000_000)).toContain("-1.50 Cr");
  });
});

describe("quantities", () => {
  it("keeps up to the requested precision", () => {
    expect(qty(12.3456, 3)).toBe("12.346");
  });

  it("drops trailing zeros rather than padding", () => {
    expect(qty(12, 3)).toBe("12");
  });

  it("returns a dash for a non-number", () => {
    expect(qty("abc")).toBe("—");
  });
});

describe("Decimal conversion", () => {
  it("converts a Prisma Decimal-like value via toString", () => {
    expect(num({ toString: () => "1234.5" })).toBe(1234.5);
  });

  it("treats null as zero", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
  });

  it("returns zero rather than NaN for junk", () => {
    expect(num("abc")).toBe(0);
  });
});

describe("dates", () => {
  it("formats as day-month-year", () => {
    // en-IN abbreviates September as "Sept", so the month is 3 or 4 letters.
    expect(formatDate("2026-09-08T00:00:00Z")).toMatch(/^\d{2} \w{3,4} 2026$/);
  });

  it("shows a dash for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("shows a dash for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-09-08T00:00:00Z")).toBe(7);
  });
});

describe("misc", () => {
  it("turns a permission code into a readable title", () => {
    expect(titleFromCode("material.indent.approvePm")).toBe("Material Indent Approve Pm");
  });

  it("merges conflicting tailwind classes, last one winning", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
