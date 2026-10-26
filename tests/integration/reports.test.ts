import { afterAll, describe, expect, it } from "vitest";

import { REPORTS, getReport, runReport } from "@/lib/reports";
import type { AuthContext } from "@/lib/rbac/context";
import { prisma, seededUsers } from "./helpers";

/** A principal that can see everything, so each report's query is exercised. */
async function omniscient(): Promise<AuthContext> {
  const { admin } = await seededUsers();
  const has = () => true;
  return {
    id: admin.id,
    employeeCode: admin.employeeCode,
    name: admin.name,
    email: admin.email,
    isSuperAdmin: true,
    roles: [],
    permissions: new Set<string>(),
    has,
    hasAny: has,
    hasAll: has,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("report catalogue", () => {
  it("has unique keys", () => {
    expect(new Set(REPORTS.map((r) => r.key)).size).toBe(REPORTS.length);
  });

  it("looks a report up by key", () => {
    for (const r of REPORTS) expect(getReport(r.key)?.key).toBe(r.key);
    expect(getReport("nope")).toBeUndefined();
  });
});

describe("every report runs against the seeded database", () => {
  for (const r of REPORTS) {
    it(r.key, async () => {
      const result = await runReport(r.key, await omniscient());
      expect(Array.isArray(result.columns)).toBe(true);
      expect(Array.isArray(result.rows)).toBe(true);
    });
  }

  it("refuses an unknown report", async () => {
    await expect(runReport("nope", await omniscient())).rejects.toThrow("Unknown report");
  });
});
