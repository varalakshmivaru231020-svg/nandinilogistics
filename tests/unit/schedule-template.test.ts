import { describe, expect, it } from "vitest";

import { DAY_MS } from "@/lib/schedule/engine";
import {
  buildTemplate, clashingCodes, instantiateTemplate,
  type SourceActivity, type SourceLink, type TemplateShape,
} from "@/lib/schedule/template";

const ORIGIN = Date.UTC(2027, 3, 1);
const at = (day: number) => ORIGIN + day * DAY_MS;

const src = (id: string, code: string, from: number, days: number, extra: Partial<SourceActivity> = {}): SourceActivity => ({
  id, code, name: `Activity ${code}`, sequence: 0,
  plannedStart: at(from), plannedEnd: at(from + days), isMilestone: false, ...extra,
});
const link = (predecessorId: string, successorId: string, type = "FS", lagDays = 0): SourceLink =>
  ({ predecessorId, successorId, type, lagDays });

describe("building a template from a schedule", () => {
  it("measures every offset from the earliest start", () => {
    const shape = buildTemplate([src("a", "EXC", 10, 5), src("b", "RAFT", 15, 8)], []);
    expect(shape.activities.map((a) => [a.code, a.offsetDays])).toEqual([["EXC", 0], ["RAFT", 5]]);
  });

  it("keeps each activity's duration", () => {
    const shape = buildTemplate([src("a", "EXC", 0, 5), src("b", "RAFT", 5, 12)], []);
    expect(shape.activities.find((a) => a.code === "RAFT")!.durationDays).toBe(12);
  });

  it("records links by code, not by id", () => {
    const shape = buildTemplate([src("a", "EXC", 0, 5), src("b", "RAFT", 5, 8)], [link("a", "b", "FS", 2)]);
    expect(shape.links).toEqual([{ predecessorCode: "EXC", successorCode: "RAFT", type: "FS", lagDays: 2 }]);
  });

  it("leaves out a link to an activity that is not being captured", () => {
    const shape = buildTemplate([src("a", "EXC", 0, 5)], [link("a", "elsewhere")]);
    expect(shape.links).toEqual([]);
  });

  it("leaves out a link whose type it cannot replay", () => {
    const shape = buildTemplate([src("a", "EXC", 0, 5), src("b", "RAFT", 5, 8)], [link("a", "b", "ZZ")]);
    expect(shape.links).toEqual([]);
  });

  it("keeps milestones as milestones", () => {
    const shape = buildTemplate([src("a", "HANDOVER", 0, 0, { isMilestone: true })], []);
    expect(shape.activities[0].isMilestone).toBe(true);
  });

  it("refuses an empty schedule", () => {
    expect(() => buildTemplate([], [])).toThrow(/nothing/i);
  });
});

describe("laying a template onto a start date", () => {
  const shape: TemplateShape = {
    activities: [
      { code: "EXC", name: "Excavation", sequence: 1, offsetDays: 0, durationDays: 5, isMilestone: false },
      { code: "RAFT", name: "Raft", sequence: 2, offsetDays: 5, durationDays: 8, isMilestone: false },
    ],
    links: [{ predecessorCode: "EXC", successorCode: "RAFT", type: "FS", lagDays: 0 }],
  };

  it("places each activity at its offset from the chosen start", () => {
    const start = Date.UTC(2030, 0, 1);
    const { activities } = instantiateTemplate(shape, start);
    const raft = activities.find((a) => a.code === "RAFT")!;
    expect(raft.start).toBe(start + 5 * DAY_MS);
    expect(raft.end).toBe(start + 13 * DAY_MS);
  });

  it("round-trips: capture then replay at the same origin gives the same dates", () => {
    const source = [src("a", "EXC", 0, 5), src("b", "RAFT", 5, 8)];
    const { activities } = instantiateTemplate(buildTemplate(source, []), ORIGIN);
    expect(activities.map((a) => [a.start, a.end])).toEqual(source.map((s) => [s.plannedStart, s.plannedEnd]));
  });

  it("carries the links across", () => {
    expect(instantiateTemplate(shape, ORIGIN).links).toHaveLength(1);
  });

  it("refuses a template that uses a code twice", () => {
    const dup = { ...shape, activities: [...shape.activities, { ...shape.activities[0] }] };
    expect(() => instantiateTemplate(dup, ORIGIN)).toThrow(/twice/);
  });

  it("refuses a link to a code the template does not contain", () => {
    const dangling = { ...shape, links: [{ predecessorCode: "EXC", successorCode: "GHOST", type: "FS" as const, lagDays: 0 }] };
    expect(() => instantiateTemplate(dangling, ORIGIN)).toThrow(/GHOST/);
  });

  it("refuses a template whose links loop", () => {
    const loop = {
      ...shape,
      links: [...shape.links, { predecessorCode: "RAFT", successorCode: "EXC", type: "FS" as const, lagDays: 0 }],
    };
    expect(() => instantiateTemplate(loop, ORIGIN)).toThrow(/loop/);
  });
});

describe("clashing codes", () => {
  const shape: TemplateShape = {
    activities: [
      { code: "EXC", name: "Excavation", sequence: 1, offsetDays: 0, durationDays: 5, isMilestone: false },
      { code: "RAFT", name: "Raft", sequence: 2, offsetDays: 5, durationDays: 8, isMilestone: false },
    ],
    links: [],
  };

  it("names the codes the project already uses, whatever their case", () => {
    expect(clashingCodes(shape, ["raft", "OTHER"])).toEqual(["RAFT"]);
  });

  it("finds nothing when the project is clear", () => {
    expect(clashingCodes(shape, ["OTHER"])).toEqual([]);
  });
});
