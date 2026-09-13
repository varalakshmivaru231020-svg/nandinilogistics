import { describe, expect, it } from "vitest";

import {
  formatResponse, isEscalationDue, median, pickAssignee, responseMinutes,
  type AssignmentCandidate,
} from "@/lib/sales/assignment";

const HOUR = 3_600_000;
const cand = (userId: string, lastAssignedAt: number | null = null): AssignmentCandidate => ({ userId, lastAssignedAt });

describe("picking who receives a new lead", () => {
  it("leaves the lead with its captor in manual mode", () => {
    expect(pickAssignee("MANUAL", [cand("a")], null)).toBeNull();
  });

  it("leaves it with its captor when nobody can take leads", () => {
    expect(pickAssignee("ROUND_ROBIN", [], null)).toBeNull();
  });

  it("gives it to someone never assigned before anyone else", () => {
    expect(pickAssignee("ROUND_ROBIN", [cand("a", 100), cand("b", null), cand("c", 50)], null)).toBe("b");
  });

  it("otherwise gives it to whoever was assigned least recently", () => {
    expect(pickAssignee("ROUND_ROBIN", [cand("a", 300), cand("b", 100), cand("c", 200)], null)).toBe("b");
  });

  it("breaks a tie the same way every time", () => {
    const pool = [cand("zed", 100), cand("amy", 100), cand("max", 100)];
    expect(pickAssignee("ROUND_ROBIN", pool, null)).toBe("amy");
    expect(pickAssignee("ROUND_ROBIN", [...pool].reverse(), null)).toBe("amy");
  });

  it("spreads successive leads evenly across the team", () => {
    const team = new Map<string, number | null>([["a", null], ["b", null], ["c", null]]);
    const given: string[] = [];
    for (let clock = 1; clock <= 9; clock++) {
      const pick = pickAssignee(
        "ROUND_ROBIN",
        [...team].map(([userId, lastAssignedAt]) => ({ userId, lastAssignedAt })),
        null,
      )!;
      given.push(pick);
      team.set(pick, clock);
    }
    const counts = given.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u]: (acc[u] ?? 0) + 1 }), {});
    expect(counts).toEqual({ a: 3, b: 3, c: 3 });
  });

  describe("project-wise", () => {
    const pool = [cand("a", 100), cand("b", 50), cand("c", 10)];

    it("chooses only among people mapped to the lead's project", () => {
      // c is least recent overall, but is not on this project.
      expect(pickAssignee("PROJECT", pool, new Set(["a", "b"]))).toBe("b");
    });

    it("falls back to the whole team when nobody mapped can take leads", () => {
      expect(pickAssignee("PROJECT", pool, new Set(["someone-else"]))).toBe("c");
    });

    it("falls back to the whole team when the lead has no project", () => {
      expect(pickAssignee("PROJECT", pool, null)).toBe("c");
    });
  });
});

describe("response time", () => {
  it("is measured in whole minutes from assignment", () => {
    expect(responseMinutes(0, 90 * 60_000 + 20_000)).toBe(90);
  });

  it("is never negative, even if clocks disagree", () => {
    expect(responseMinutes(10_000, 0)).toBe(0);
  });

  it("reads the way a sales head reads it", () => {
    expect(formatResponse(null)).toBe("—");
    expect(formatResponse(45)).toBe("45m");
    expect(formatResponse(90)).toBe("1h 30m");
    expect(formatResponse(120)).toBe("2h");
    expect(formatResponse(24 * 60 + 60)).toBe("1d 1h");
    expect(formatResponse(48 * 60)).toBe("2d");
  });

  it("summarises by the median, which one weekend lead cannot distort", () => {
    expect(median([10, 12, 15, 4000])).toBe(14);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("when an overdue follow-up escalates", () => {
  const now = 1_000 * HOUR;
  const lead = (over: Partial<{ state: string; nextActionAt: number | null; escalatedAt: number | null }> = {}) => ({
    state: "CONTACTED",
    nextActionAt: now - 30 * HOUR,
    escalatedAt: null,
    ...over,
  });

  it("escalates once the grace period has passed", () => {
    expect(isEscalationDue(lead(), now, 24)).toBe(true);
  });

  it("waits out the grace period first", () => {
    expect(isEscalationDue(lead({ nextActionAt: now - 5 * HOUR }), now, 24)).toBe(false);
  });

  it("does not escalate the same lapse twice", () => {
    expect(isEscalationDue(lead({ escalatedAt: now - HOUR }), now, 24)).toBe(false);
  });

  it("leaves booked and lost leads alone", () => {
    expect(isEscalationDue(lead({ state: "BOOKED" }), now, 24)).toBe(false);
    expect(isEscalationDue(lead({ state: "LOST" }), now, 24)).toBe(false);
  });

  it("has nothing to escalate when no follow-up is set", () => {
    expect(isEscalationDue(lead({ nextActionAt: null }), now, 24)).toBe(false);
  });
});
