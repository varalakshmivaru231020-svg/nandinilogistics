import type { UnitStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  checkStatusChange, checkUnitDeletable, checkUnitValues, findLockedChanges, indexUnitLookups,
  unitEditLocks, unitKey, validateUnitDraft,
  type UnitDraft, type UnitInput, type UnitLookups,
} from "@/lib/units/unit-rules";

const lookups = (over: Partial<UnitLookups> = {}): UnitLookups => ({
  projects: [{ id: "p-nns", code: "NNS" }, { id: "p-oth", code: "OTH" }],
  accessibleProjectIds: "all",
  blocks: [
    { id: "b-a", projectId: "p-nns", code: "A", name: "Tower A", totalFloors: 14 },
    { id: "b-z", projectId: "p-oth", code: "Z", name: "Tower Z", totalFloors: 0 },
  ],
  unitTypes: [{ id: "ut-2", code: "2BHK", name: "2 BHK" }],
  existingUnits: new Set([unitKey("p-nns", "A-0101")]),
  ...over,
});

const draft = (over: Partial<UnitDraft> = {}): UnitDraft => ({
  projectId: "p-nns", blockId: "b-a", unitTypeId: "ut-2", unitNumber: "A-0201",
  floorNumber: "2", carpetArea: "845", builtUpArea: "1010", superBuiltUpArea: "1245",
  facing: " East ", plcTag: "park facing", parkingSlots: "1",
  ...over,
});

const issuesOf = (d: Partial<UnitDraft>, l: Partial<UnitLookups> = {}) =>
  validateUnitDraft(draft(d), indexUnitLookups(lookups(l))).issues;
const messages = (d: Partial<UnitDraft>, l: Partial<UnitLookups> = {}) => issuesOf(d, l).map((i) => i.message).join(" | ");

describe("validateUnitDraft — the form's unit", () => {
  it("accepts a good unit and normalises it", () => {
    const { issues, input } = validateUnitDraft(draft(), indexUnitLookups(lookups()));
    expect(issues).toEqual([]);
    expect(input).toEqual({
      projectId: "p-nns", blockId: "b-a", unitTypeId: "ut-2", unitNumber: "A-0201", floorNumber: 2,
      carpetArea: 845, builtUpArea: 1010, superBuiltUpArea: 1245, facing: "East", plcTag: "PARK_FACING", parkingSlots: 1,
    });
  });

  it("requires project, block and unit type", () => {
    const fields = issuesOf({ projectId: "", blockId: "", unitTypeId: "" }).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["project", "block", "unitType"]));
  });

  it("refuses a project the user is not mapped to", () => {
    expect(messages({}, { accessibleProjectIds: new Set(["p-oth"]) })).toMatch(/NNS is not mapped to you/);
  });

  it("refuses a block from another project", () => {
    const i = issuesOf({ blockId: "b-z" });
    expect(i).toContainEqual({ field: "block", message: "Block Tower Z is not in project NNS" });
  });

  it("refuses an unknown block or unit type", () => {
    expect(messages({ blockId: "nope", unitTypeId: "nope" })).toMatch(/block is not available.*unit type is not available/);
  });

  it("refuses a unit number already in the project, ignoring case and spaces", () => {
    expect(issuesOf({ unitNumber: "a-01 01" })).toContainEqual({ field: "unitNumber", message: "Unit a-01 01 already exists in NNS" });
    // …but not in another project.
    expect(messages({ projectId: "p-oth", blockId: "b-z", unitNumber: "A-0101" })).toBe("");
  });

  it("refuses bad numbers, areas that do not nest, and a floor the block does not have", () => {
    expect(messages({ floorNumber: "-1" })).toMatch(/Floor cannot be negative/);
    expect(messages({ floorNumber: "2.5" })).toMatch(/not a whole number/);
    expect(messages({ floorNumber: "15" })).toMatch(/above Tower A's 14 floors/);
    expect(messages({ carpetArea: "abc" })).toMatch(/not a number of sq.ft/);
    expect(messages({ carpetArea: "1300", builtUpArea: "" })).toMatch(/Carpet area is more than super built-up area/);
    expect(messages({ builtUpArea: "800" })).toMatch(/Built-up area is less than carpet area/);
    expect(messages({ builtUpArea: "1300" })).toMatch(/Built-up area is more than super built-up area/);
    expect(messages({ superBuiltUpArea: "0", carpetArea: "0", builtUpArea: "" })).toMatch(/Super built-up area must be more than zero/);
    expect(messages({ parkingSlots: "51" })).toMatch(/Parking slots 51 is more than 50/);
    expect(messages({ unitNumber: "" })).toMatch(/Unit number is required/);
    expect(messages({ facing: "x".repeat(41) })).toMatch(/Facing is longer than 40/);
  });

  it("does not check a floor against a block from another project", () => {
    expect(checkUnitValues(draft({ floorNumber: "99" })).issues).toEqual([]);
  });
});

describe("unitEditLocks", () => {
  const untouched = { status: "AVAILABLE" as UnitStatus, holds: 0, bookings: 0, costSheets: 0 };

  it("locks only the project on an untouched unit", () => {
    const locks = unitEditLocks(untouched);
    expect([...locks.locked]).toEqual(["project"]);
    expect(locks.identityReason).toBeNull();
    expect(unitEditLocks({ ...untouched, status: "BLOCKED" }).locked.size).toBe(1);
  });

  it.each([
    [{ holds: 1 }, /a hold/],
    [{ costSheets: 2 }, /2 cost sheets/],
    [{ bookings: 1 }, /a booking/],
    [{ status: "HELD" as UnitStatus }, /is held/],
  ])("locks identity once a unit has %o", (over, reason) => {
    const locks = unitEditLocks({ ...untouched, ...over });
    for (const f of ["project", "block", "unitNumber", "unitType", "floorNumber", "carpetArea", "builtUpArea", "superBuiltUpArea"]) {
      expect(locks.locked.has(f as never)).toBe(true);
    }
    for (const f of ["facing", "plcTag", "parkingSlots"]) expect(locks.locked.has(f as never)).toBe(false);
    expect(locks.identityReason).toMatch(reason);
  });

  const before: UnitInput = {
    projectId: "p", blockId: "b", unitTypeId: "t", unitNumber: "A-1", floorNumber: 1,
    carpetArea: 800, builtUpArea: 900, superBuiltUpArea: 1200, facing: null, plcTag: null, parkingSlots: 0,
  };

  it("reports each locked field an edit changes, and lets free fields through", () => {
    const locks = unitEditLocks({ ...untouched, holds: 1 });
    const after = { ...before, unitNumber: "A-2", superBuiltUpArea: 1300, facing: "East", plcTag: "CORNER", parkingSlots: 2 };
    expect(findLockedChanges(before, after, locks).map((i) => i.field)).toEqual(["unitNumber", "superBuiltUpArea"]);
    expect(findLockedChanges(before, { ...before, facing: "North", parkingSlots: 3 }, locks)).toEqual([]);
  });

  it("refuses moving any unit to another project", () => {
    expect(findLockedChanges(before, { ...before, projectId: "q" }, unitEditLocks(untouched)).map((i) => i.field)).toEqual(["project"]);
    expect(findLockedChanges(before, { ...before, unitNumber: "A-9", carpetArea: 700 }, unitEditLocks(untouched))).toEqual([]);
  });
});

describe("checkStatusChange", () => {
  it("allows AVAILABLE → BLOCKED with a reason, and BLOCKED → AVAILABLE", () => {
    expect(checkStatusChange("AVAILABLE", "BLOCKED", "Held back for the owner")).toBeNull();
    expect(checkStatusChange("BLOCKED", "AVAILABLE", "")).toBeNull();
  });

  it("requires a reason to block, and a sensible length", () => {
    expect(checkStatusChange("AVAILABLE", "BLOCKED", "  ")).toMatch(/reason/);
    expect(checkStatusChange("AVAILABLE", "BLOCKED", "x".repeat(501))).toMatch(/under 500/);
  });

  const ALL: UnitStatus[] = ["AVAILABLE", "HELD", "BOOKED", "AGREEMENT", "REGISTERED", "BLOCKED"];
  const allowed = new Set(["AVAILABLE>BLOCKED", "BLOCKED>AVAILABLE"]);
  const refused = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(([f, t]) => !allowed.has(`${f}>${t}`));

  it("has 34 refused transitions", () => expect(refused).toHaveLength(34));

  it.each(refused)("refuses %s → %s", (from, to) => {
    expect(checkStatusChange(from, to, "a reason")).toEqual(expect.any(String));
  });

  it("explains that sales statuses belong to the sales flow", () => {
    expect(checkStatusChange("HELD", "AVAILABLE", "r")).toMatch(/cleared by its hold or booking/);
    expect(checkStatusChange("AVAILABLE", "BOOKED", "r")).toMatch(/cannot be set by hand/);
    expect(checkStatusChange("BLOCKED", "BLOCKED", "r")).toMatch(/already blocked/);
  });
});

describe("checkUnitDeletable", () => {
  const clean = { unitNumber: "A-1", status: "AVAILABLE" as UnitStatus, holds: 0, bookings: 0, costSheets: 0, priceItems: 0 };

  it("allows an untouched available or blocked unit", () => {
    expect(checkUnitDeletable(clean)).toBeNull();
    expect(checkUnitDeletable({ ...clean, status: "BLOCKED" })).toBeNull();
  });

  it("names what stands in the way and suggests blocking", () => {
    expect(checkUnitDeletable({ ...clean, holds: 1 })).toMatch(/it has a hold\. Block it instead/);
    expect(checkUnitDeletable({ ...clean, costSheets: 2, priceItems: 1 })).toMatch(/2 cost sheets, a price-list rate/);
    expect(checkUnitDeletable({ ...clean, status: "BOOKED", bookings: 1 })).toMatch(/it is booked; it has a booking/);
    for (const status of ["HELD", "BOOKED", "AGREEMENT", "REGISTERED"] as UnitStatus[]) {
      expect(checkUnitDeletable({ ...clean, status })).toMatch(/cannot be deleted/);
    }
  });
});
