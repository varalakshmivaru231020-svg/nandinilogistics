import { describe, expect, it } from "vitest";

import { audienceFor } from "@/lib/tasks/notify";

const task = { assigneeId: "assignee", createdById: "assigner" };

describe("who hears about a task event", () => {
  it("tells the assignee they were given it", () => {
    expect(audienceFor("ASSIGNED", task)).toEqual(["assignee"]);
  });

  it("tells the assigner an extension was asked for", () => {
    expect(audienceFor("EXTENSION_REQUESTED", task)).toEqual(["assigner"]);
  });

  it("tells the assignee what was decided", () => {
    expect(audienceFor("EXTENSION_DECIDED", task)).toEqual(["assignee"]);
    expect(audienceFor("CLOSED", task)).toEqual(["assignee"]);
  });

  it("tells both parties about a status change or a comment", () => {
    expect(audienceFor("STATUS_CHANGED", task)).toEqual(["assignee", "assigner"]);
    expect(audienceFor("COMMENTED", task)).toEqual(["assignee", "assigner"]);
  });

  it("tells both parties when a checklist fails, with the remarks", () => {
    expect(audienceFor("CHECKLIST_FAILED", task)).toEqual(["assignee", "assigner"]);
  });

  it("tells both parties it is due soon or overdue", () => {
    expect(audienceFor("DUE_SOON", task)).toEqual(["assignee", "assigner"]);
    expect(audienceFor("OVERDUE", task)).toEqual(["assignee", "assigner"]);
  });

  it("tells only the level that just became active", () => {
    expect(audienceFor("LEVEL_ACTIVE", task, ["reviewer-2"])).toEqual(["reviewer-2"]);
  });

  it("tells nobody when a level has nobody on it", () => {
    expect(audienceFor("LEVEL_ACTIVE", task, [])).toEqual([]);
  });
});
