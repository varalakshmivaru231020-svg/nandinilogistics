import { describe, expect, it } from "vitest";

import {
  advanceListWhere, bikeRentListWhere, describeAdvanceFilters, readAdvanceListParams, readBikeRentListParams,
} from "@/lib/advances/list-filters";
import { advanceSummaryOf, bikeRentRunning, bikeRentSummaryOf } from "@/lib/advances/list-display";
import { describePayoutFilters, payoutLineWhere, readPayoutListParams } from "@/lib/payouts/list-filters";
import { payoutSummaryOf } from "@/lib/payouts/list-display";
import { describeScope, employeeScopeWhere, type ViewerScope } from "@/lib/payouts/scope";

describe("whose money a person sees", () => {
  it("narrows an Employee query by the viewer's scope", () => {
    expect(employeeScopeWhere({ kind: "all" })).toEqual({});
    expect(employeeScopeWhere({ kind: "team", companyIds: ["c1", "c2"] })).toEqual({ companies: { some: { companyId: { in: ["c1", "c2"] } } } });
    expect(employeeScopeWhere({ kind: "onboarded", userId: "u1" })).toEqual({ lead: { ownerId: "u1" } });
    expect(employeeScopeWhere({ kind: "self", employeeId: "e1" })).toEqual({ id: "e1" });
    // Somebody with the page but no team, no lead duty and no rider record sees nothing, not everything.
    expect(employeeScopeWhere({ kind: "none" })).toEqual({ id: "__nobody__" });
  });

  it("says so in words on an export", () => {
    expect(describeScope({ kind: "all" })).toBeNull();
    expect(describeScope({ kind: "team", companyIds: [] })).toBe("Your team");
  });
});

const team: ViewerScope = { kind: "team", companyIds: ["c1"] };

describe("the payout list", () => {
  it("reads the screen's parameters, treating 'all' as nothing and dropping a bad date", () => {
    expect(readPayoutListParams({ company: "all", status: "HOLD", from: "2026-02-31", to: "2026-03-08", q: " x " }))
      .toEqual({ company: "", status: "HOLD", from: "", to: "2026-03-08", q: "x" });
  });

  it("shows only posted sheets unless the viewer manages imports", () => {
    const params = readPayoutListParams({});
    expect(payoutLineWhere(team, params, { seesDrafts: false })).toMatchObject({ import: { status: "POSTED" } });
    expect((payoutLineWhere(team, params, { seesDrafts: true }).import as Record<string, unknown>).status).toBeUndefined();
  });

  it("carries the scope, the company, the status, the period and the search", () => {
    const where = payoutLineWhere(team, readPayoutListParams({ company: "c1", status: "HOLD", from: "2026-03-02", to: "2026-03-08", q: "NL0" }), { seesDrafts: false });
    expect(where.employee).toEqual(employeeScopeWhere(team));
    expect(where.status).toBe("HOLD");
    expect(where.import).toMatchObject({ companyId: "c1", periodFrom: { gte: new Date("2026-03-02T00:00:00.000Z") }, periodTo: { lte: new Date("2026-03-08T00:00:00.000Z") } });
    expect(where.OR).toHaveLength(2);
  });

  it("describes the filters", () => {
    expect(describePayoutFilters(readPayoutListParams({}), null, null)).toBe("All posted payouts");
    expect(describePayoutFilters(readPayoutListParams({ status: "HOLD", q: "NL" }), "Peeko", "Your team")).toBe("Matching “NL” · Peeko · On hold · Your team");
  });

  it("adds the band up from the lines", () => {
    const f = payoutSummaryOf([
      { employeeId: "a", totalPayout: 1000, advance: 100, bikeRental: 50, tds: 10, finalPayout: 840, status: "PAID" },
      { employeeId: "b", totalPayout: 2000, advance: 0, bikeRental: 0, tds: 0, finalPayout: 2000, status: "HOLD" },
      { employeeId: "a", totalPayout: 500, advance: 0, bikeRental: 0, tds: 0, finalPayout: 500, status: "PAID" },
    ]);
    expect(f).toEqual({ totalPayout: 3500, deductions: 160, finalPayout: 3340, held: 1, heldAmount: 2000, riders: 2 });
  });
});

describe("the advance list", () => {
  it("reads its parameters", () => {
    expect(readAdvanceListParams({ status: "all", priority: "EMERGENCY", company: "c1", q: "ram" }))
      .toEqual({ status: "", priority: "EMERGENCY", company: "c1", q: "ram" });
  });

  it("narrows by scope, status, priority, company and search", () => {
    const where = advanceListWhere(team, readAdvanceListParams({ status: "PENDING", priority: "LOW", company: "c2", q: "ram" }));
    expect(where.employee).toEqual({ companies: { some: { companyId: "c2" } } });
    expect(where.status).toBe("PENDING");
    expect(where.priority).toBe("LOW");
    expect(where.OR).toHaveLength(3);
  });

  it("ignores a status or priority it does not know", () => {
    const where = advanceListWhere({ kind: "all" }, readAdvanceListParams({ status: "MAYBE", priority: "URGENT" }));
    expect(where.status).toBeUndefined();
    expect(where.priority).toBeUndefined();
  });

  it("describes the filters", () => {
    expect(describeAdvanceFilters(readAdvanceListParams({}), null, null)).toBe("All advance requests");
    expect(describeAdvanceFilters(readAdvanceListParams({ status: "APPROVED", priority: "EMERGENCY" }), "Slikk", "Your own")).toBe("Slikk · Approved · Emergency · Your own");
  });

  it("adds the band up, counting only what is still outstanding", () => {
    const f = advanceSummaryOf([
      { status: "PENDING", amount: 1000, recoveredAmount: 0 },
      { status: "APPROVED", amount: 5000, recoveredAmount: 2000 },
      { status: "APPROVED", amount: 500, recoveredAmount: 500 },
      { status: "REJECTED", amount: 700, recoveredAmount: 0 },
    ]);
    expect(f).toEqual({ pending: 1, pendingAmount: 1000, approved: 2, outstanding: 3000, rejected: 1 });
  });
});

describe("the bike rent list", () => {
  it("tells a running assignment from an ended one by today's date", () => {
    expect(bikeRentRunning(null, "2026-03-10")).toBe(true);
    expect(bikeRentRunning("2026-03-10", "2026-03-10")).toBe(true);
    expect(bikeRentRunning("2026-03-09", "2026-03-10")).toBe(false);
  });

  it("filters running and ended the same way", () => {
    const day = new Date("2026-03-10T00:00:00.000Z");
    expect(bikeRentListWhere({ kind: "all" }, readBikeRentListParams({ state: "active" }), "2026-03-10").OR)
      .toEqual([{ endDate: null }, { endDate: { gte: day } }]);
    expect(bikeRentListWhere({ kind: "all" }, readBikeRentListParams({ state: "ended" }), "2026-03-10").endDate)
      .toEqual({ lt: day });
  });

  it("adds the band up from the running assignments", () => {
    const f = bikeRentSummaryOf([
      { rentPerWeek: 700, endDate: null },
      { rentPerWeek: 300, endDate: "2026-03-20" },
      { rentPerWeek: 900, endDate: "2026-03-01" },
    ], "2026-03-10");
    expect(f).toEqual({ running: 2, weeklyRent: 1000, ended: 1 });
  });
});
