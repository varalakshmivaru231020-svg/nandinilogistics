import { describe, expect, it } from "vitest";

import {
  assignmentRuleFor, formatResponse, isEscalationDue, isOpenStageKind, median, pickAssignee,
  responseMinutes,
  type AssignmentCandidate,
} from "@/lib/sales/assignment";

const HOUR = 3_600_000;
const cand = (userId: string, lastAssignedAt: number | null = null): AssignmentCandidate => ({ userId, lastAssignedAt });

describe("whose rule applies when a lead is captured", () => {
  it("makes Admin and a Team Leader choose the tele-caller", () => {
    expect(assignmentRuleFor({ canAssign: true, receivesLeads: false })).toEqual({ kind: "must-choose" });
    // Holding both, the stronger duty wins: whoever may assign has to say who.
    expect(assignmentRuleFor({ canAssign: true, receivesLeads: true })).toEqual({ kind: "must-choose" });
  });

  it("lets a tele-caller keep what they capture", () => {
    expect(assignmentRuleFor({ canAssign: false, receivesLeads: true })).toEqual({ kind: "self" });
  });

  it("hands a rider's referral round-robin", () => {
    expect(assignmentRuleFor({ canAssign: false, receivesLeads: false })).toEqual({ kind: "round-robin" });
  });
});

describe("picking who receives a new lead", () => {
  it("leaves the lead with its captor in manual mode", () => {
    expect(pickAssignee("MANUAL", [cand("a")])).toBeNull();
  });

  it("leaves it with its captor when nobody can take leads", () => {
    expect(pickAssignee("ROUND_ROBIN", [])).toBeNull();
  });

  it("gives it to someone never assigned before anyone else", () => {
    expect(pickAssignee("ROUND_ROBIN", [cand("a", 100), cand("b", null), cand("c", 50)])).toBe("b");
  });

  it("otherwise gives it to whoever was assigned least recently", () => {
    expect(pickAssignee("ROUND_ROBIN", [cand("a", 300), cand("b", 100), cand("c", 200)])).toBe("b");
  });

  it("breaks a tie the same way every time", () => {
    const pool = [cand("zed", 100), cand("amy", 100), cand("max", 100)];
    expect(pickAssignee("ROUND_ROBIN", pool)).toBe("amy");
    expect(pickAssignee("ROUND_ROBIN", [...pool].reverse())).toBe("amy");
  });

  it("spreads successive leads evenly across the tele-callers", () => {
    const team = new Map<string, number | null>([["a", null], ["b", null], ["c", null]]);
    const given: string[] = [];
    for (let clock = 1; clock <= 9; clock++) {
      const pick = pickAssignee(
        "ROUND_ROBIN",
        [...team].map(([userId, lastAssignedAt]) => ({ userId, lastAssignedAt })),
      )!;
      given.push(pick);
      team.set(pick, clock);
    }
    const counts = given.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u]: (acc[u] ?? 0) + 1 }), {});
    expect(counts).toEqual({ a: 3, b: 3, c: 3 });
  });
});

describe("response time", () => {
  it("is whole minutes from assignment, never negative", () => {
    expect(responseMinutes(0, 90_000)).toBe(2);
    expect(responseMinutes(0, 89_000)).toBe(1);
    expect(responseMinutes(100, 50)).toBe(0);
  });

  it("reads the way a team leader reads it", () => {
    expect(formatResponse(null)).toBe("—");
    expect(formatResponse(45)).toBe("45m");
    expect(formatResponse(60)).toBe("1h");
    expect(formatResponse(135)).toBe("2h 15m");
    expect(formatResponse(24 * 60)).toBe("1d");
    expect(formatResponse(26 * 60)).toBe("1d 2h");
  });

  it("takes the median, so one lead over a weekend cannot misrepresent a team", () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
    expect(median([5, 1, 9])).toBe(5);
    expect(median([1, 2, 3, 4000])).toBe(3);
  });
});

describe("follow-up escalation", () => {
  const now = 1_000 * HOUR;
  const lead = (over: Partial<{ stageKind: string; nextActionAt: number | null; escalatedAt: number | null }>) => ({
    stageKind: "OPEN", nextActionAt: now - 30 * HOUR, escalatedAt: null, ...over,
  });

  it("knows which stage kinds are still open", () => {
    expect(isOpenStageKind("NEW")).toBe(true);
    expect(isOpenStageKind("OPEN")).toBe(true);
    expect(isOpenStageKind("ONBOARDING")).toBe(true);
    expect(isOpenStageKind("LOST")).toBe(false);
  });

  it("escalates an open lead overdue past the grace period", () => {
    expect(isEscalationDue(lead({}), now, 24)).toBe(true);
  });

  it("waits out the grace period", () => {
    expect(isEscalationDue(lead({ nextActionAt: now - 23 * HOUR }), now, 24)).toBe(false);
  });

  it("never escalates the same lapse twice", () => {
    expect(isEscalationDue(lead({ escalatedAt: now - HOUR }), now, 24)).toBe(false);
  });

  it("leaves a lost lead, and one with no next action, alone", () => {
    expect(isEscalationDue(lead({ stageKind: "LOST" }), now, 24)).toBe(false);
    expect(isEscalationDue(lead({ nextActionAt: null }), now, 24)).toBe(false);
  });

  it("follows whatever Admin names the stage — only its kind matters", () => {
    expect(isEscalationDue(lead({ stageKind: "ONBOARDING" }), now, 24)).toBe(true);
  });
});
