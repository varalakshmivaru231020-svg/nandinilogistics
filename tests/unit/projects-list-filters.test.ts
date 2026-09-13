import { $Enums } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  describeProjectFilters, PROJECT_STATUSES, progressLogWhere, projectListWhere,
  readProgressListParams, readProjectListParams,
} from "@/lib/projects/list-filters";

const everyone = { canAccessAllProjects: true, projectIds: [] };
const mapped = { canAccessAllProjects: false, projectIds: ["p1", "p2"] };

describe("project list filters", () => {
  it("applies nothing for someone who sees every project and has no filter", () => {
    expect(projectListWhere(everyone, readProjectListParams({}))).toEqual({});
  });

  it("keeps a mapped user to their projects, whatever else is filtered", () => {
    const where = projectListWhere(mapped, readProjectListParams({ q: "tower", status: "ACTIVE" }));
    expect(where.id).toEqual({ in: ["p1", "p2"] });
    expect(where.status).toBe("ACTIVE");
    expect(where.OR).toHaveLength(5);
  });

  it("searches code, name, RERA, city and project manager", () => {
    const where = projectListWhere(everyone, readProjectListParams(new URLSearchParams("q=%20Hyd%20")));
    expect(where.OR).toEqual([
      { code: { contains: "Hyd", mode: "insensitive" } },
      { name: { contains: "Hyd", mode: "insensitive" } },
      { reraNumber: { contains: "Hyd", mode: "insensitive" } },
      { city: { is: { name: { contains: "Hyd", mode: "insensitive" } } } },
      { projectManager: { is: { name: { contains: "Hyd", mode: "insensitive" } } } },
    ]);
  });

  it("ignores a status that is not a ProjectStatus", () => {
    expect(readProjectListParams({ status: "DROP TABLE" }).status).toBe("");
    expect(projectListWhere(everyone, readProjectListParams({ status: "all" }))).toEqual({});
  });

  it("offers exactly the ProjectStatus enum", () => {
    expect([...PROJECT_STATUSES].sort()).toEqual(Object.values($Enums.ProjectStatus).sort());
  });

  it("describes the filters, including the scoping", () => {
    expect(describeProjectFilters(readProjectListParams({}), everyone)).toBe("All projects");
    expect(describeProjectFilters(readProjectListParams({ status: "ON_HOLD" }), mapped))
      .toBe("Status on hold · Your mapped projects");
  });
});

describe("site progress filters", () => {
  it("keeps only ownership for an unfiltered, unscoped viewer", () => {
    expect(progressLogWhere(everyone, {}, readProgressListParams({}))).toEqual({});
    expect(progressLogWhere(everyone, { loggedById: "u1" }, readProgressListParams({}))).toEqual({ loggedById: "u1" });
  });

  it("scopes to mapped projects and never lets the project filter widen it", () => {
    const where = progressLogWhere(mapped, { loggedById: "u1" }, readProgressListParams({ project: "p9" }));
    expect(where.loggedById).toBe("u1");
    // Both conditions must hold: p9 is outside the mapping, so nothing matches.
    expect(where.AND).toEqual([{ projectId: { in: ["p1", "p2"] } }, { projectId: "p9" }]);
  });

  it("covers the whole last day of the log-date range", () => {
    const where = progressLogWhere(everyone, {}, readProgressListParams({ from: "2026-09-01", to: "2026-09-10" }));
    expect(where.AND).toEqual([
      { logDate: { gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2026-09-11T00:00:00.000Z") } },
    ]);
  });

  it("searches title, notes, weather and author", () => {
    const where = progressLogWhere(everyone, {}, readProgressListParams(new URLSearchParams("q=slab")));
    const and = where.AND as Array<{ OR?: unknown[] }>;
    expect(and).toHaveLength(1);
    expect(and[0].OR).toHaveLength(4);
  });

  it("ignores a malformed project id and dates that do not exist", () => {
    const p = readProgressListParams({ project: "a b;c", from: "13/09/2026", to: "2026-13-01" });
    expect(p.filters).toEqual({});
  });
});
