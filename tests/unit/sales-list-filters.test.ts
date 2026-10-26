import { describe, expect, it } from "vitest";

import { describeLeadFilters, leadListWhere, readLeadListParams } from "@/lib/sales/lead-list";
import { describeRange, joinFilters, readDateRange, readParam, toSearchParams } from "@/lib/sales/list-common";

const NOW = new Date("2026-09-13T10:00:00.000Z");
const qs = (s: string) => new URLSearchParams(s);

// JSON round-trip turns Dates into strings, which makes nested conditions easy to compare.
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("list-common", () => {
  it("reads a trimmed param from URLSearchParams or a searchParams record", () => {
    expect(readParam(qs("q=%20rider%20"), "q")).toBe("rider");
    expect(readParam({ q: ["a", "b"] }, "q")).toBe("a");
    expect(readParam({}, "q")).toBe("");
  });

  it("drops malformed dates and turns a backwards range round", () => {
    expect(readDateRange(qs("from=2026-02-31&to=nope"))).toEqual({});
    expect(readDateRange(qs("from=2026-06-30&to=2026-04-01"))).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("builds URLSearchParams from a page's searchParams", () => {
    expect(toSearchParams({ q: "x", status: ["A", "B"], empty: "", none: undefined }).toString()).toBe("q=x&status=A");
  });

  it("puts a range and a filter list into words", () => {
    expect(describeRange("Captured", { from: "2026-04-01" })).toBe("Captured from 01 Apr 2026");
    expect(describeRange("Captured", {})).toBeNull();
    expect(joinFilters([null, "A", false, "B"], "All")).toBe("A · B");
    expect(joinFilters([null], "All")).toBe("All");
  });
});

describe("readLeadListParams", () => {
  it("reads the screen registry's parameters, treating 'all' as nothing", () => {
    expect(readLeadListParams(qs("q=ravi&stage=all&company=c1&owner=u1&fu=today&from=2026-09-01&to=2026-09-30"))).toEqual({
      q: "ravi", stage: "", company: "c1", owner: "u1", fu: "today", from: "2026-09-01", to: "2026-09-30",
    });
  });

  it("drops a malformed date", () => {
    expect(readLeadListParams({ from: "yesterday", to: "2026-02-31" })).toMatchObject({ from: "", to: "" });
  });
});

describe("leadListWhere", () => {
  it("is only the ownership with no filters", () => {
    expect(leadListWhere({}, readLeadListParams(qs("")), NOW)).toEqual({});
    expect(leadListWhere({ ownerId: "u1" }, readLeadListParams(qs("")), NOW)).toEqual({ ownerId: "u1" });
  });

  it("searches name, phone, lead number and location", () => {
    const w = json(leadListWhere({}, readLeadListParams(qs("q=Koramangala")), NOW));
    expect(w.OR.map((c: object) => Object.keys(c)[0])).toEqual(["name", "phone", "leadNo", "location"]);
  });

  it("filters by stage id, company tag and tele-caller", () => {
    expect(leadListWhere({}, readLeadListParams(qs("stage=s1&company=c1&owner=u2")), NOW)).toEqual({
      stageId: "s1",
      companies: { some: { companyId: "c1" } },
      ownerId: "u2",
    });
  });

  it("never lets the tele-caller filter widen a scoped viewer's own pipeline", () => {
    expect(leadListWhere({ ownerId: "u1" }, readLeadListParams(qs("owner=u2")), NOW)).toEqual({ ownerId: "u1" });
  });

  it("measures the follow-up buckets against the caller's clock", () => {
    expect(leadListWhere({}, readLeadListParams(qs("fu=overdue")), NOW)).toEqual({ nextActionAt: { lt: NOW } });
    expect(leadListWhere({}, readLeadListParams(qs("fu=none")), NOW)).toEqual({ nextActionAt: null });
    const week = leadListWhere({}, readLeadListParams(qs("fu=week")), NOW) as { nextActionAt: { gte: Date; lte: Date } };
    expect(week.nextActionAt.gte).toEqual(NOW);
    expect(week.nextActionAt.lte.getTime() - NOW.getTime()).toBe(7 * 86_400_000);
    expect(leadListWhere({}, readLeadListParams(qs("fu=sometime")), NOW)).toEqual({});
  });

  it("covers the whole of the last captured day", () => {
    expect(leadListWhere({}, readLeadListParams(qs("from=2026-04-01&to=2026-04-30")), NOW)).toEqual({
      createdAt: { gte: new Date("2026-04-01T00:00:00.000Z"), lt: new Date("2026-05-01T00:00:00.000Z") },
    });
  });

  it("describes the filters", () => {
    expect(describeLeadFilters(readLeadListParams(qs("")))).toBe("All leads in view");
    expect(
      describeLeadFilters(readLeadListParams(qs("q=ravi&stage=s1&fu=overdue&from=2026-04-01")), { stage: "Training", company: "Peeko" }),
    ).toBe('Search "ravi" · Stage Training · Company Peeko · Follow-up overdue · Captured 2026-04-01 to any');
  });
});
