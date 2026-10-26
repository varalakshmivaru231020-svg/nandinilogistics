import { describe, expect, it } from "vitest";

import { REPORTS } from "@/lib/reports";
import {
  dateCondition, describeFilters, filterQueryString, filterSpecFor, hasFilters,
  parseReportFilters, REPORT_FILTER_SPEC,
} from "@/lib/reports/filters";

const both = { company: true, date: "Payout period" };

describe("report filter catalogue", () => {
  it("declares the filters for every report, and no report that does not exist", () => {
    expect(Object.keys(REPORT_FILTER_SPEC).sort()).toEqual(REPORTS.map((r) => r.key).sort());
  });

  it("offers nothing for an unknown report", () => {
    expect(filterSpecFor("nope")).toEqual({ company: false, date: null });
  });
});

describe("parseReportFilters", () => {
  it("reads company and range from a query string", () => {
    const params = new URLSearchParams("company=c1&from=2026-04-01&to=2026-06-30");
    expect(parseReportFilters(params, both)).toEqual({ companyId: "c1", from: "2026-04-01", to: "2026-06-30" });
  });

  it("reads Next's searchParams object, taking the first of repeated values", () => {
    expect(parseReportFilters({ company: ["c1", "c2"], from: "2026-04-01" }, both))
      .toEqual({ companyId: "c1", from: "2026-04-01" });
  });

  it("drops dates that are malformed or do not exist", () => {
    expect(parseReportFilters({ from: "01/04/2026", to: "2026-02-31" }, both)).toEqual({});
  });

  it("turns a backwards range round", () => {
    expect(parseReportFilters({ from: "2026-06-30", to: "2026-04-01" }, both))
      .toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("ignores a date range on a report that is a position at a moment", () => {
    expect(parseReportFilters({ company: "c1", from: "2026-04-01" }, { company: true, date: null }))
      .toEqual({ companyId: "c1" });
  });

  it("ignores a company id that could not be one", () => {
    expect(parseReportFilters({ company: "c1' OR 1=1" }, both)).toEqual({});
  });

  it("knows when anything is filtered", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ to: "2026-01-01" })).toBe(true);
  });
});

describe("dateCondition", () => {
  it("is absent without a range", () => {
    expect(dateCondition({ companyId: "c1" })).toBeUndefined();
  });

  it("includes the whole of the last day", () => {
    const c = dateCondition({ from: "2026-04-01", to: "2026-06-30" })!;
    expect(c.gte!.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(c.lt!.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("rolls the end of a month and a year correctly", () => {
    expect(dateCondition({ to: "2026-12-31" })!.lt!.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("query string and description", () => {
  it("round-trips through the URL", () => {
    const f = { companyId: "c1", from: "2026-04-01", to: "2026-06-30" };
    expect(parseReportFilters(new URLSearchParams(filterQueryString(f)), both)).toEqual(f);
    expect(filterQueryString({})).toBe("");
  });

  it("describes the filters in words", () => {
    expect(describeFilters({}, null)).toBe("All companies · All dates");
    expect(describeFilters({ companyId: "c1", from: "2026-04-01", to: "2026-06-30" }, "Peeko"))
      .toBe("Peeko · 01 Apr 2026 – 30 Jun 2026");
    expect(describeFilters({ from: "2026-04-01" }, null)).toContain("From 01 Apr 2026");
  });
});
