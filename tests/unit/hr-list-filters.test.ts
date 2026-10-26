import { describe, expect, it } from "vitest";

import {
  describeEmployeeFilters, employeeListWhere, maskId, readEmployeeListParams,
} from "@/lib/hr/list-filters";

describe("employee list filters", () => {
  it("applies nothing without a filter", () => {
    expect(employeeListWhere(readEmployeeListParams({}))).toEqual({});
  });

  it("searches name, code and mobile", () => {
    const where = employeeListWhere(readEmployeeListParams(new URLSearchParams("q=%2098480")));
    expect(where.OR).toEqual([
      { name: { contains: "98480", mode: "insensitive" } },
      { employeeCode: { contains: "98480", mode: "insensitive" } },
      { mobile: { contains: "98480" } },
    ]);
  });

  it("filters by employment type and designation", () => {
    expect(employeeListWhere(readEmployeeListParams({ type: "cltype1", designation: "cldes1" }))).toEqual({
      employmentTypeId: "cltype1",
      designationId: "cldes1",
    });
  });

  it("ignores malformed ids from a hand-edited URL", () => {
    expect(readEmployeeListParams({ type: "x' OR '1", designation: "a/b" })).toEqual({ q: "", type: "", designation: "", company: "", status: "" });
  });

  it("defaults to every status", () => {
    expect(readEmployeeListParams({}).status).toBe("");
    expect(employeeListWhere(readEmployeeListParams({ status: "all" }))).toEqual({});
  });

  it("filters by status, treating anything not INACTIVE as active", () => {
    expect(employeeListWhere(readEmployeeListParams({ status: "INACTIVE" }))).toEqual({ status: "INACTIVE" });
    expect(employeeListWhere(readEmployeeListParams({ status: "active" }))).toEqual({ status: { not: "INACTIVE" } });
    expect(employeeListWhere(readEmployeeListParams(new URLSearchParams("status=ACTIVE&type=cltype1")))).toEqual({
      employmentTypeId: "cltype1",
      status: { not: "INACTIVE" },
    });
  });

  it("ignores an unknown status", () => {
    expect(readEmployeeListParams({ status: "SUSPENDED" }).status).toBe("");
    expect(employeeListWhere(readEmployeeListParams({ status: "'; DROP" }))).toEqual({});
  });

  it("describes the filters", () => {
    expect(describeEmployeeFilters(readEmployeeListParams({}), { type: null, designation: null })).toBe("All riders and staff");
    expect(describeEmployeeFilters(readEmployeeListParams({ q: "ram" }), { type: "Contract", designation: null }))
      .toBe('Search "ram" · Type Contract');
    expect(describeEmployeeFilters(readEmployeeListParams({ status: "INACTIVE" }), { type: null, designation: null }))
      .toBe("Left only");
  });

  it("masks identity numbers down to the last four", () => {
    expect(maskId(null)).toBeNull();
    expect(maskId("123412341234")).toBe("•••••••• 1234");
    expect(maskId("123")).toBe("••••");
  });
});
