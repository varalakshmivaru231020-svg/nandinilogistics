import { describe, expect, it } from "vitest";

import { describeUnitFilters, readUnitListParams, unitListWhere } from "@/lib/units/unit-list";

const all = { canAccessAllProjects: true, projectIds: [] };
const mapped = { canAccessAllProjects: false, projectIds: ["p1", "p2"] };

describe("readUnitListParams", () => {
  it("reads URLSearchParams and a page's searchParams record alike, defaulting to all", () => {
    expect(readUnitListParams(new URLSearchParams("q=A-01&status=HELD"))).toEqual({
      q: "A-01", status: "HELD", project: "all", block: "all", type: "all",
    });
    expect(readUnitListParams({ project: ["p1", "p2"], block: "b1" })).toMatchObject({ project: "p1", block: "b1", status: "all" });
  });
});

describe("unitListWhere", () => {
  it("does not scope someone who sees every project", () => {
    expect(unitListWhere(all, readUnitListParams(new URLSearchParams()))).toEqual({});
  });

  it("scopes to mapped projects when no project is chosen", () => {
    expect(unitListWhere(mapped, readUnitListParams(new URLSearchParams()))).toEqual({ projectId: { in: ["p1", "p2"] } });
  });

  it("narrows to a chosen mapped project", () => {
    expect(unitListWhere(mapped, readUnitListParams(new URLSearchParams("project=p2")))).toEqual({ projectId: "p2" });
  });

  it("matches nothing for a project the caller is not mapped to — the filter never widens scope", () => {
    expect(unitListWhere(mapped, readUnitListParams(new URLSearchParams("project=p9")))).toEqual({ projectId: { in: [] } });
    expect(unitListWhere(all, readUnitListParams(new URLSearchParams("project=p9")))).toEqual({ projectId: "p9" });
  });

  it("applies search, status, block and unit type", () => {
    const where = unitListWhere(all, readUnitListParams(new URLSearchParams("q=%20a-01%20&status=AVAILABLE&block=b1&type=t1")));
    expect(where).toEqual({
      unitNumber: { contains: "a-01", mode: "insensitive" },
      status: "AVAILABLE",
      blockId: "b1",
      unitTypeId: "t1",
    });
  });

  it("ignores a status that is not a status rather than sending it to the database", () => {
    expect(unitListWhere(all, readUnitListParams(new URLSearchParams("status=SOLD")))).toEqual({});
  });
});

describe("describeUnitFilters", () => {
  it("puts the filters in words", () => {
    const p = readUnitListParams(new URLSearchParams("q=A&status=HELD&project=p1&block=b1"));
    expect(describeUnitFilters(p, { project: "NNS", block: "Tower A" })).toBe('Search "A" · Status held · Project NNS · Block Tower A');
    expect(describeUnitFilters(readUnitListParams(new URLSearchParams()), {})).toBe("All units in view");
  });
});
