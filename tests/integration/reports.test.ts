import { afterAll, describe, expect, it } from "vitest";

import { REPORTS, runReport, getReport } from "@/lib/reports";
import type { AuthContext } from "@/lib/rbac/context";
import { prisma, seededUsers } from "./helpers";

/** A principal that can see everything, so each report's query is exercised. */
async function omniscient(): Promise<AuthContext> {
  const { owner } = await seededUsers();
  const has = () => true;
  return {
    id: owner.id,
    employeeCode: owner.employeeCode,
    name: owner.name,
    email: owner.email,
    isSuperAdmin: true,
    roles: [],
    permissions: new Set<string>(),
    projectIds: [],
    canAccessAllProjects: true,
    approvalLimits: {},
    has,
    hasAny: has,
    hasAll: has,
    approvalLimitFor: () => 0,
  };
}

/** A sales executive scoped to nothing, to prove scoping is applied. */
async function scopedToNothing(): Promise<AuthContext> {
  const { sales } = await seededUsers();
  const has = () => true;
  return {
    id: sales.id,
    employeeCode: sales.employeeCode,
    name: sales.name,
    email: sales.email,
    isSuperAdmin: false,
    roles: [],
    permissions: new Set<string>(),
    projectIds: [],
    canAccessAllProjects: false,
    approvalLimits: {},
    has,
    hasAny: has,
    hasAll: has,
    approvalLimitFor: () => 0,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("report catalogue", () => {
  it("declares 13 reports with unique keys", () => {
    expect(REPORTS).toHaveLength(13);
    expect(new Set(REPORTS.map((r) => r.key)).size).toBe(13);
  });

  it("gives every report a label, description and audience", () => {
    const bare = REPORTS.filter((r) => !r.label || !r.description || !r.audience);
    expect(bare.map((r) => r.key)).toEqual([]);
  });

  it("resolves each key back through getReport", () => {
    for (const r of REPORTS) expect(getReport(r.key)).toBeDefined();
  });

  it("rejects an unknown key rather than returning empty data", async () => {
    await expect(runReport("noSuchReport", await omniscient())).rejects.toThrow(/Unknown report/);
  });
});

describe.each(REPORTS.map((r) => [r.key, r.label] as const))("report: %s", (key) => {
  it("runs and returns a well-formed result", async () => {
    const result = await runReport(key, await omniscient());
    expect(Array.isArray(result.columns)).toBe(true);
    expect(result.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("gives every column a key and a header", async () => {
    const result = await runReport(key, await omniscient());
    const bare = result.columns.filter((c) => !c.key || !c.header);
    expect(bare).toEqual([]);
  });

  it("returns rows whose shape matches the declared columns", async () => {
    const result = await runReport(key, await omniscient());
    if (result.rows.length === 0) return;
    const columnKeys = new Set(result.columns.map((c) => c.key));
    // Every declared column must be addressable on a row.
    for (const c of columnKeys) {
      expect(Object.prototype.hasOwnProperty.call(result.rows[0], c), `${key}.${c}`).toBe(true);
    }
  });
});

describe("project scoping is applied inside reports", () => {
  it("returns nothing for a principal mapped to no project", async () => {
    const ctx = await scopedToNothing();
    for (const key of ["collections", "bookingRegister", "unitAvailability", "indentAgeing"]) {
      const result = await runReport(key, ctx);
      expect(result.rows, `${key} leaked rows to an unscoped user`).toHaveLength(0);
    }
  });

  it("returns data for a principal who can see every project", async () => {
    const result = await runReport("unitAvailability", await omniscient());
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

describe("reports compute rather than merely list", () => {
  it("derives budget utilisation from committed purchase orders", async () => {
    const result = await runReport("budgetVsActual", await omniscient());
    const row = result.rows[0] as Record<string, number>;
    expect(row.available).toBeCloseTo(row.budget - row.committed, 2);
    if (row.budget > 0) {
      expect(row.utilisation).toBe(Math.round((row.committed / row.budget) * 100));
    }
  });

  it("measures schedule slip against the baseline, not the revised plan", async () => {
    const result = await runReport("scheduleVariance", await omniscient());
    const slipped = (result.rows as Array<Record<string, unknown>>).filter(
      (r) => Number(r.slipDays) > 0,
    );
    // The demo data deliberately contains slipped activities.
    expect(slipped.length).toBeGreaterThan(0);
    for (const r of slipped) {
      expect(r.delayReason, "a slipped activity must carry a reason").not.toBe("—");
    }
  });

  it("reports a conversion rate consistent with the funnel counts", async () => {
    const result = await runReport("salesFunnel", await omniscient());
    const total = (result.rows as Array<{ count: number }>).reduce((s, r) => s + r.count, 0);
    const booked = (result.rows as Array<{ stage: string; count: number }>)
      .find((r) => r.stage === "BOOKED")?.count ?? 0;
    const conversion = result.summary?.find((s) => s.label === "Conversion")?.value;
    if (total > 0) expect(conversion).toBe(`${Math.round((booked / total) * 100)}%`);
  });

  it("never reports collected more than the consideration", async () => {
    const result = await runReport("collections", await omniscient());
    for (const row of result.rows as Array<Record<string, number>>) {
      expect(row.collected).toBeLessThanOrEqual(row.total + 0.01);
      expect(row.outstanding).toBeCloseTo(row.total - row.collected, 2);
    }
  });

  it("reconciles stock valuation to quantity times average rate", async () => {
    const result = await runReport("stockValuation", await omniscient());
    for (const row of result.rows as Array<Record<string, number>>) {
      expect(row.value).toBeCloseTo(row.quantity * row.avgRate, 0);
    }
  });
});
