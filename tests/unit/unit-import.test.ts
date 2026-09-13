import { describe, expect, it } from "vitest";

import { matchColumns } from "@/lib/import/columns";
import { UNIT_IMPORT_COLUMNS, planUnitImport, unitKey, type UnitImportLookups } from "@/lib/units/unit-import";
import { unitExportColumns } from "@/lib/units/unit-list";

const lookups = (over: Partial<UnitImportLookups> = {}): UnitImportLookups => ({
  projects: [{ id: "p-nns", code: "NNS" }, { id: "p-oth", code: "OTH" }],
  accessibleProjectIds: "all",
  blocks: [
    { id: "b-a", projectId: "p-nns", code: "A", name: "Tower A", totalFloors: 14 },
    { id: "b-b", projectId: "p-nns", code: "B", name: "Tower B", totalFloors: 0 },
    { id: "b-dup1", projectId: "p-nns", code: "C1", name: "Cluster", totalFloors: 0 },
    { id: "b-dup2", projectId: "p-nns", code: "C2", name: "Cluster", totalFloors: 0 },
    { id: "b-oth", projectId: "p-oth", code: "Z", name: "Tower Z", totalFloors: 0 },
  ],
  unitTypes: [
    { id: "ut-2", code: "2BHK", name: "2 BHK" },
    { id: "ut-3", code: "3BHK", name: "3 BHK" },
    { id: "ut-x1", code: "PH1", name: "Penthouse" },
    { id: "ut-x2", code: "PH2", name: "Penthouse" },
  ],
  existingUnits: new Set([unitKey("p-nns", "A-0101")]),
  ...over,
});

const HEADERS = ["Project", "Block", "Unit number", "Unit type", "Floor", "Carpet area", "Built-up area", "Super built-up area", "Facing", "PLC tag", "Parking slots"];

function sheet(rows: string[][], headers = HEADERS) {
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

const good = ["nns", "Tower A", "A-0201", "2 bhk", "2", "845", "1,010", "1245", "East", "park facing", "1"];
const errorsOf = (row: string[], over: Partial<UnitImportLookups> = {}) =>
  planUnitImport(sheet([row]), lookups(over)).rows[0].errors.join(" | ");
const withCell = (header: string, value: string) => good.map((v, i) => (HEADERS[i] === header ? value : v));

describe("planUnitImport", () => {
  it("resolves project by code, block within the project, unit type by name, and starts nothing sold", () => {
    const plan = planUnitImport(sheet([good]), lookups());
    expect(plan.missing).toEqual([]);
    expect(plan.valid).toBe(1);
    expect(plan.rows[0].row).toBe(2);
    expect(plan.rows[0].input).toEqual({
      projectId: "p-nns", blockId: "b-a", unitTypeId: "ut-2", unitNumber: "A-0201", floorNumber: 2,
      carpetArea: 845, builtUpArea: 1010, superBuiltUpArea: 1245, facing: "East", plcTag: "PARK_FACING", parkingSlots: 1,
    });
  });

  it("reports missing required columns before looking at any row", () => {
    const plan = planUnitImport(sheet([["NNS"]], ["Project"]), lookups());
    expect(plan.missing).toEqual(expect.arrayContaining(["Block", "Unit number", "Unit type", "Floor", "Carpet area", "Super built-up area"]));
    expect(plan.rows).toEqual([]);
  });

  it("refuses a project that is not a code", () => {
    expect(errorsOf(withCell("Project", "NN Skyline"))).toMatch(/not a project code/);
  });

  it("refuses a project the importer is not mapped to", () => {
    expect(errorsOf(withCell("Project", "NNS"), { accessibleProjectIds: new Set(["p-oth"]) })).toMatch(/not mapped to you/);
  });

  it("looks for the block only within the row's project", () => {
    expect(errorsOf(withCell("Block", "Tower Z"))).toMatch(/Block "Tower Z" is not in project NNS/);
  });

  it("refuses a block name two blocks share", () => {
    expect(errorsOf(withCell("Block", "cluster"))).toMatch(/matches more than one block/);
  });

  it("refuses unknown and ambiguous unit types", () => {
    expect(errorsOf(withCell("Unit type", "4 BHK"))).toMatch(/not recognised/);
    expect(errorsOf(withCell("Unit type", "Penthouse"))).toMatch(/more than one entry/);
    // …but the unique code still works.
    expect(errorsOf(withCell("Unit type", "PH1"))).toBe("");
  });

  it("refuses a unit number already in the project, ignoring case and spacing", () => {
    expect(errorsOf(withCell("Unit number", "a-01 01"))).toMatch(/already exists in NNS/);
  });

  it("allows the same unit number in a different project", () => {
    expect(errorsOf(["OTH", "Tower Z", "A-0101", "2 BHK", "1", "800", "", "1200"])).toBe("");
  });

  it("refuses a unit number repeated within the file, naming the first row", () => {
    const plan = planUnitImport(sheet([good, withCell("Unit number", "a-0201")]), lookups());
    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.rows[1].errors.join()).toMatch(/repeated from row 2/);
    expect(plan.valid).toBe(1);
    expect(plan.invalid).toBe(1);
  });

  it("requires block, unit type, floor and areas", () => {
    const e = errorsOf(["NNS", "", "A-0909", "", "", "", "", ""]);
    for (const m of ["Block is required", "Unit type is required", "Floor is required", "Carpet area is required", "Super built-up area is required"]) {
      expect(e).toContain(m);
    }
  });

  it("refuses numbers that are not numbers, negative floors and fractional floors", () => {
    expect(errorsOf(withCell("Carpet area", "large"))).toMatch(/not a number of sq.ft/);
    expect(errorsOf(withCell("Floor", "-1"))).toMatch(/cannot be negative/);
    expect(errorsOf(withCell("Floor", "2.5"))).toMatch(/not a whole number/);
    expect(errorsOf(withCell("Parking slots", "two"))).toMatch(/not a whole number/);
  });

  it("refuses areas that do not nest", () => {
    expect(errorsOf(withCell("Carpet area", "1300"))).toMatch(/Carpet area is more than super built-up area/);
    expect(errorsOf(withCell("Built-up area", "800"))).toMatch(/Built-up area is less than carpet area/);
    expect(errorsOf(withCell("Built-up area", "1300"))).toMatch(/Built-up area is more than super built-up area/);
    expect(errorsOf(withCell("Super built-up area", "0"))).toMatch(/more than zero/);
  });

  it("refuses a floor above the block's floor count", () => {
    expect(errorsOf(withCell("Floor", "15"))).toMatch(/above Tower A's 14 floors/);
  });

  it("accepts a Status column only when it says Available", () => {
    const headers = [...HEADERS, "Status"];
    const ok = planUnitImport(sheet([[...good, "Available"]], headers), lookups());
    expect(ok.rows[0].errors).toEqual([]);
    const booked = planUnitImport(sheet([[...good, "BOOKED"]], headers), lookups());
    expect(booked.rows[0].errors.join()).toMatch(/start Available/);
  });

  it("reads every column back from the export's headers", () => {
    const headers = unitExportColumns(true).map((c) => c.header);
    const { mapping, missing, ignored } = matchColumns(headers, UNIT_IMPORT_COLUMNS);
    expect(missing).toEqual([]);
    expect(ignored).toEqual([]);
    expect(Object.keys(mapping).sort()).toEqual(UNIT_IMPORT_COLUMNS.map((c) => c.key).sort());
  });
});
