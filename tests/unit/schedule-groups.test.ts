import { describe, expect, it } from "vitest";

import { groupSchedule, type ScheduleCategory } from "@/lib/schedule/groups";

function category(id: string, name: string, extra: Partial<ScheduleCategory> = {}): ScheduleCategory {
  return {
    id,
    name,
    phaseName: "Schedule",
    manager: null,
    plannedStart: null,
    plannedEnd: null,
    ...extra,
  };
}

function activity(id: string, groupId: string, groupName = "Foundation") {
  return { id, groupId, groupName, phaseName: "Schedule", groupManager: null };
}

describe("groupSchedule", () => {
  it("keeps a main category that has no sub-activities yet", () => {
    const groups = groupSchedule([category("wp1", "FND — Foundation")], []);

    expect([...groups.keys()]).toEqual(["wp1"]);
    expect(groups.get("wp1")!.name).toBe("FND — Foundation");
    expect(groups.get("wp1")!.items).toEqual([]);
  });

  it("shows the category's own dates until its activities set them", () => {
    const groups = groupSchedule(
      [category("wp1", "FND — Foundation", { plannedStart: "2026-04-01", plannedEnd: "2026-06-30" })],
      [],
    );

    expect(groups.get("wp1")!.plannedStart).toBe("2026-04-01");
    expect(groups.get("wp1")!.plannedEnd).toBe("2026-06-30");
  });

  it("hangs each activity off its own category", () => {
    const groups = groupSchedule(
      [category("wp1", "FND — Foundation"), category("wp2", "STR — Structure")],
      [activity("a1", "wp1"), activity("a2", "wp2"), activity("a3", "wp1")],
    );

    expect(groups.get("wp1")!.items.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(groups.get("wp2")!.items.map((a) => a.id)).toEqual(["a2"]);
  });

  it("keeps the order the categories were given in", () => {
    const groups = groupSchedule(
      [category("wp2", "STR — Structure"), category("wp1", "FND — Foundation")],
      [activity("a1", "wp1")],
    );

    expect([...groups.keys()]).toEqual(["wp2", "wp1"]);
  });

  it("still shows an activity whose category is missing from the list", () => {
    const groups = groupSchedule([], [activity("a1", "orphan", "Site clearing")]);

    expect(groups.get("orphan")!.name).toBe("Site clearing");
    expect(groups.get("orphan")!.items.map((a) => a.id)).toEqual(["a1"]);
  });

  it("gives an empty project no groups at all, so the empty state still shows", () => {
    expect(groupSchedule([], []).size).toBe(0);
  });
});
