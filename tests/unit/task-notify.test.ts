import { describe, expect, it } from "vitest";

import { audienceFor } from "@/lib/tasks/notify";

const task = { assigneeIds: ["tl-1", "tl-2"], createdById: "admin" };

describe("who hears about a task event", () => {
  it("tells every Team Leader they were given it", () => {
    expect(audienceFor("ASSIGNED", task)).toEqual(["tl-1", "tl-2"]);
  });

  it("tells everybody on it about a status change or a remark", () => {
    expect(audienceFor("STATUS_CHANGED", task)).toEqual(["tl-1", "tl-2", "admin"]);
    expect(audienceFor("COMMENTED", task)).toEqual(["tl-1", "tl-2", "admin"]);
  });

  it("tells everybody it is due soon or overdue", () => {
    expect(audienceFor("DUE_SOON", task)).toEqual(["tl-1", "tl-2", "admin"]);
    expect(audienceFor("OVERDUE", task)).toEqual(["tl-1", "tl-2", "admin"]);
  });

  it("tells nobody when nobody was assigned", () => {
    expect(audienceFor("ASSIGNED", { assigneeIds: [], createdById: "admin" })).toEqual([]);
  });
});
