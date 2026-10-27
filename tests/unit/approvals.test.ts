import { describe, expect, it } from "vitest";

import { checkDecision, initialApproval, leadWorkBlock, waitingLabel } from "@/lib/approvals/rule";
import { filterInbox, leadApprovalScope, readInboxParams, seesAllApprovals, type InboxRow } from "@/lib/approvals/inbox";
import { checkReferrer } from "@/lib/riders/referrals";
import { staffTypeFor } from "@/lib/hr/staff-link";
import { checkInCard, planPunchIn, planPunchOut } from "@/lib/hr/punch";
import { PERM } from "@/lib/permissions/codes";

describe("the fixed approval rule", () => {
  it("holds what a tele-caller raises, and nothing else", () => {
    expect(initialApproval({ receivesLeads: true, canDecide: false })).toBe("PENDING");
    // Team Leader / Admin: they decide, so their own work is approved.
    expect(initialApproval({ receivesLeads: false, canDecide: true })).toBe("APPROVED");
    expect(initialApproval({ receivesLeads: true, canDecide: true })).toBe("APPROVED");
    // A rider referring a friend.
    expect(initialApproval({ receivesLeads: false, canDecide: false })).toBe("APPROVED");
  });

  it("needs a reason to reject, and decides only what is pending", () => {
    expect(checkDecision("PENDING", "REJECTED", " ").ok).toBe(false);
    expect(checkDecision("PENDING", "REJECTED", "Duplicate")).toEqual({ ok: true, decision: "REJECTED", note: "Duplicate" });
    expect(checkDecision("PENDING", "APPROVED", "")).toEqual({ ok: true, decision: "APPROVED", note: null });
    expect(checkDecision("APPROVED", "APPROVED", "").ok).toBe(false);
    expect(checkDecision("PENDING", "MAYBE", "").ok).toBe(false);
  });

  it("blocks work on a pending or rejected lead", () => {
    expect(leadWorkBlock("APPROVED")).toBeNull();
    expect(leadWorkBlock("PENDING")).toMatch(/approval/);
    expect(leadWorkBlock("REJECTED")).toMatch(/read-only/);
  });

  it("says how long something has waited", () => {
    expect(waitingLabel(0, 30 * 60_000)).toBe("under an hour");
    expect(waitingLabel(0, 5 * 3_600_000)).toBe("5 h");
    expect(waitingLabel(0, 72 * 3_600_000)).toBe("3 days");
  });
});

describe("the inbox's scope and filters", () => {
  const viewer = (codes: string[], isSuperAdmin = false) => ({ id: "u1", isSuperAdmin, has: (c: string) => isSuperAdmin || codes.includes(c) });

  it("lets Super Admin and viewAll see every lead", () => {
    expect(seesAllApprovals(viewer([], true))).toBe(true);
    expect(leadApprovalScope(viewer([PERM.hr.employee.viewAll]))).toEqual({});
  });

  it("narrows a Team Leader to their companies' leads and untagged ones", () => {
    expect(leadApprovalScope(viewer([PERM.approvals.queue.decide]))).toEqual({
      OR: [
        { companies: { some: { company: { teamLeaders: { some: { userId: "u1" } } } } } },
        { companies: { none: {} } },
      ],
    });
  });

  it("filters by type, raiser and text, oldest first", () => {
    const rows: InboxRow[] = [
      { kind: "LEAD", id: "a", what: "Lead LD1 — Ravi", detail: null, raisedBy: "Priya", raisedAtMs: 20, href: "" },
      { kind: "ADVANCE", id: "b", what: "Advance ₹500 — Arun", detail: "rent", raisedBy: "Arun", raisedAtMs: 10, href: "" },
    ];
    expect(filterInbox(rows, readInboxParams({})).map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterInbox(rows, readInboxParams({ type: "lead" })).map((r) => r.id)).toEqual(["a"]);
    expect(filterInbox(rows, readInboxParams({ raisedBy: "pri" })).map((r) => r.id)).toEqual(["a"]);
    expect(filterInbox(rows, readInboxParams({ q: "rent" })).map((r) => r.id)).toEqual(["b"]);
    expect(readInboxParams({ type: "nonsense" }).type).toBe("");
  });
});

describe("referral validation", () => {
  const rider = { id: "r1", employmentTypeName: "Rider", onboardingStatus: "ACCEPTED", status: "ACTIVE" };
  it("accepts an active, accepted rider", () => {
    expect(checkReferrer(rider, "r2")).toEqual({ ok: true });
    expect(checkReferrer(rider, null)).toEqual({ ok: true });
  });
  it("refuses self-referral, non-riders, unaccepted and left riders, and nobody", () => {
    expect(checkReferrer(rider, "r1").ok).toBe(false);
    expect(checkReferrer({ ...rider, employmentTypeName: "Internal Staff" }, null).ok).toBe(false);
    expect(checkReferrer({ ...rider, onboardingStatus: "SUBMITTED" }, null).ok).toBe(false);
    expect(checkReferrer({ ...rider, status: "INACTIVE" }, null).ok).toBe(false);
    expect(checkReferrer(null, null).ok).toBe(false);
  });
});

describe("staff person records and the web's check in", () => {
  it("gives each staff login the right employment type", () => {
    expect(staffTypeFor({ isSuperAdmin: true, roleCodes: ["ADMIN"] })).toBeNull();
    expect(staffTypeFor({ isSuperAdmin: false, roleCodes: ["RIDER"] })).toBeNull();
    expect(staffTypeFor({ isSuperAdmin: false, roleCodes: ["TEAM_LEADER"] })).toBe("Team Leader");
    expect(staffTypeFor({ isSuperAdmin: false, roleCodes: ["TELE_CALLER"] })).toBe("Internal Staff");
  });

  it("punches without a location, and keeps the half-day rule", () => {
    const at = new Date("2026-10-27T03:30:00.000Z"); // 09:00 IST
    const inPlan = planPunchIn(null, at, { lat: null, lng: null });
    expect(inPlan.ok && inPlan.data.punchInLat).toBeNull();
    const day = { status: "PRESENT", punchInAt: at, punchOutAt: null };
    const out = planPunchOut(day, new Date(at.getTime() + 2 * 3_600_000), { lat: null, lng: null });
    expect(out.ok && out.data.status).toBe("HALF_DAY");
    expect(checkInCard(day)).toEqual({ state: "PUNCHED_IN", inAt: "09:00", outAt: null });
    expect(checkInCard(null).state).toBe("NOT_PUNCHED");
  });
});
