import { describe, expect, it } from "vitest";

import {
  DEFAULT_PER_FLOOR, planTower, towerProblem, towerSummary,
} from "@/lib/units/tower-plan";

/**
 * Laying out a tower.
 *
 * This arithmetic was inside the Create-units screen, so the only way to
 * generate a tower was to be that screen. Now the screen previews it and the
 * action writes it, which is only safe if the numbering is pinned.
 */

describe("the numbering is the design's", () => {
  it("is the floor, then the flat in two digits", () => {
    const flats = planTower({ floors: 2, perFloor: 3, unitTypeId: "t1" });
    expect(flats.map((f) => f.number)).toEqual(["101", "102", "103", "201", "202", "203"]);
    expect(flats.map((f) => f.floor)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(flats.every((f) => f.unitTypeId === "t1")).toBe(true);
  });

  /// Floor twelve is 1201, not 121 — two digits for the flat, always.
  it("keeps two digits past the ninth floor", () => {
    const flats = planTower({ floors: 12, perFloor: 4 });
    expect(flats.at(-1)!.number).toBe("1204");
    expect(flats).toHaveLength(48);
  });

  it("is four to a floor unless told otherwise", () => {
    expect(DEFAULT_PER_FLOOR).toBe(4);
    expect(planTower({ floors: 3, perFloor: DEFAULT_PER_FLOOR })).toHaveLength(12);
  });
});

describe("a floor or a flat that differs", () => {
  it("takes a floor's own count", () => {
    // A ground-floor retail level with two shops under eight flats above.
    const flats = planTower({ floors: 3, perFloor: 4, floorOverrides: { 1: 2 } });
    expect(flats.filter((f) => f.floor === 1)).toHaveLength(2);
    expect(flats).toHaveLength(10);
  });

  it("takes a flat's own number and kind", () => {
    const flats = planTower({
      floors: 1,
      perFloor: 2,
      unitTypeId: "t1",
      flatOverrides: { "1-2": { number: "101-A", unitTypeId: "t2" } },
    });
    expect(flats.map((f) => f.number)).toEqual(["101", "101-A"]);
    expect(flats.map((f) => f.unitTypeId)).toEqual(["t1", "t2"]);
  });

  /// An override that names no kind means **unassigned**, not the default —
  /// `undefined` is "say nothing", `null` is "none".
  it("tells saying nothing apart from saying none", () => {
    const said = planTower({
      floors: 1, perFloor: 2, unitTypeId: "t1",
      flatOverrides: { "1-1": { unitTypeId: null }, "1-2": { number: "x" } },
    });
    expect(said[0].unitTypeId).toBeNull();
    expect(said[1].unitTypeId).toBe("t1");
  });
});

describe("the summary the screen shows", () => {
  it("counts each kind, and what has none", () => {
    const flats = planTower({
      floors: 1, perFloor: 3, unitTypeId: "t1",
      flatOverrides: { "1-3": { unitTypeId: null } },
    });
    expect(towerSummary(flats, [{ id: "t1", name: "2 BHK" }])).toEqual([
      { label: "2 BHK", count: 2 },
      { label: "Unassigned", count: 1 },
    ]);
  });
});

describe("a shape that cannot be generated", () => {
  it("says which, in words", () => {
    expect(towerProblem({ floors: 0, perFloor: 4 })).toMatch(/at least one floor/);
    expect(towerProblem({ floors: 4, perFloor: 0 })).toMatch(/at least one flat/);
    expect(towerProblem({ floors: 4, perFloor: 4 })).toBeNull();
  });

  /// Nothing half-built: a fractional count is floored, not rounded up.
  it("counts whole flats only", () => {
    expect(planTower({ floors: 2.9, perFloor: 2.9 })).toHaveLength(4);
  });
});
