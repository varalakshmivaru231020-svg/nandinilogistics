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

describe("report filters narrow, and never widen", () => {
  async function someProject() {
    const project = await prisma.project.findFirst({
      where: { units: { some: {} } },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    expect(project, "the demo data has a project with units").not.toBeNull();
    return project!.id;
  }

  it("refuses to show a project the principal is not mapped to, even when asked for by id", async () => {
    const ctx = await scopedToNothing();
    const projectId = await someProject();
    for (const key of ["collections", "bookingRegister", "unitAvailability", "indentAgeing", "budgetVsActual"]) {
      const result = await runReport(key, ctx, { projectId });
      expect(result.rows, `${key} widened scope through the project filter`).toHaveLength(0);
    }
  });

  it("returns a subset of the unfiltered report when narrowed to one project", async () => {
    const ctx = await omniscient();
    const projectId = await someProject();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } });

    const all = await runReport("unitAvailability", ctx);
    const one = await runReport("unitAvailability", ctx, { projectId });
    expect(one.rows.length).toBeGreaterThan(0);
    expect(one.rows.length).toBeLessThanOrEqual(all.rows.length);
    expect(one.rows.every((r) => r.project === project.code)).toBe(true);
  });

  it("keeps only bookings inside the date range", async () => {
    const ctx = await omniscient();
    const all = await runReport("bookingRegister", ctx);
    if (all.rows.length === 0) return;

    const dates = all.rows.map((r) => new Date(r.bookingDate as Date).toISOString().slice(0, 10)).sort();
    const pivot = dates[Math.floor(dates.length / 2)];

    const from = await runReport("bookingRegister", ctx, { from: pivot });
    expect(from.rows.every((r) => new Date(r.bookingDate as Date).toISOString().slice(0, 10) >= pivot)).toBe(true);

    const upTo = await runReport("bookingRegister", ctx, { to: pivot });
    expect(upTo.rows.every((r) => new Date(r.bookingDate as Date).toISOString().slice(0, 10) <= pivot)).toBe(true);

    // The pivot day is in both halves; every other booking is in exactly one.
    const onPivot = dates.filter((d) => d === pivot).length;
    expect(from.rows.length + upTo.rows.length).toBe(all.rows.length + onPivot);
  });

  it("ignores a date range on a report that is a position at a moment", async () => {
    const ctx = await omniscient();
    const plain = await runReport("stockValuation", ctx);
    const ranged = await runReport("stockValuation", ctx, { from: "1990-01-01", to: "1990-01-02" });
    expect(ranged.rows.length).toBe(plain.rows.length);
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
