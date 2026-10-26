import { describe, expect, it } from "vitest";

import {
  dateInputValue, editRefusal, editSummary, LeadEditError, maskChanges,
  planDuplicateRelink, planLeadEdit,
  type EditableLead, type LeadEditActor, type PhoneCandidate,
} from "@/lib/sales/lead-edit";

const lead = (over: Partial<EditableLead> = {}): EditableLead => ({
  id: "L1",
  ownerId: "u-owner",
  stageKind: "OPEN",
  name: "Asha Rao",
  phone: "9845012345",
  altPhone: null,
  email: "asha@example.com",
  location: "Koramangala",
  requirement: "Has own bike",
  nextActionAt: new Date("2026-09-20T03:30:00.000Z"),
  companyIds: ["c-peeko"],
  ...over,
});

const owner: LeadEditActor = { id: "u-owner", canViewAll: false, canViewContact: true };
const manager: LeadEditActor = { id: "u-tl", canViewAll: true, canViewContact: true };

function refusal(fn: () => unknown): LeadEditError {
  try {
    fn();
  } catch (err) {
    if (err instanceof LeadEditError) return err;
    throw err;
  }
  throw new Error("expected a refusal");
}

describe("who may edit", () => {
  it("lets the owner, or anyone with viewAll, edit — nobody else", () => {
    expect(editRefusal(owner, lead())).toBeNull();
    expect(editRefusal(manager, lead())).toBeNull();
    expect(editRefusal({ ...owner, id: "u-other" }, lead())).toMatch(/assigned to you/);

    const err = refusal(() => planLeadEdit(lead(), { ...owner, id: "u-other" }, { name: "Changed" }));
    expect(err.kind).toBe("forbidden");
    expect(err.needs).toBe("viewAll");
  });
});

describe("what changes", () => {
  it("reports only the fields that differ, and keeps what the form leaves out", () => {
    const { changed, after } = planLeadEdit(lead(), owner, { name: "Asha R. Rao", location: "HSR Layout" });
    expect(changed).toEqual(["name", "location"]);
    expect(after.phone).toBe("9845012345");
    expect(after.companyIds).toEqual(["c-peeko"]);
  });

  it("blanks optional fields to null when the form clears them", () => {
    const { changed, after } = planLeadEdit(lead(), owner, { email: "", requirement: "  ", nextActionAt: "" });
    expect(changed).toEqual(["email", "requirement", "nextActionAt"]);
    expect(after.email).toBeNull();
    expect(after.requirement).toBeNull();
    expect(after.nextActionAt).toBeNull();
  });

  it("applies the capture rules", () => {
    expect(refusal(() => planLeadEdit(lead(), owner, { name: "A" })).message).toBe("Name is required");
    expect(refusal(() => planLeadEdit(lead(), owner, { email: "not-an-email" })).message).toMatch(/email/i);
    expect(refusal(() => planLeadEdit(lead(), owner, { phone: "123" })).message).toMatch(/phone|mobile/i);
    expect(refusal(() => planLeadEdit(lead(), owner, { nextActionAt: "next week" })).message).toMatch(/date/);
  });

  it("sorts and de-duplicates the companies, whichever way the form carried them", () => {
    expect(planLeadEdit(lead(), owner, { companyIds: ["c-slikk", "c-peeko", "c-slikk"] }).after.companyIds)
      .toEqual(["c-peeko", "c-slikk"]);
    expect(planLeadEdit(lead(), owner, { companyIds: "c-slikk,c-peeko" }).after.companyIds)
      .toEqual(["c-peeko", "c-slikk"]);
    expect(planLeadEdit(lead(), owner, { companyIds: ["c-peeko"] }).changed).toEqual([]);
  });

  it("keeps an untouched next action date at its stored time, and replaces a changed one", () => {
    const stored = lead({ nextActionAt: new Date("2026-09-20T03:30:00.000Z") });
    const same = planLeadEdit(stored, owner, { nextActionAt: dateInputValue(stored.nextActionAt) });
    expect(same.changed).toEqual([]);
    expect(same.after.nextActionAt?.toISOString()).toBe("2026-09-20T03:30:00.000Z");

    const moved = planLeadEdit(stored, owner, { nextActionAt: "2026-09-25" });
    expect(moved.changed).toEqual(["nextActionAt"]);
    expect(moved.after.nextActionAt?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("never touches stage, owner or anything outside the editable fields", () => {
    const { after } = planLeadEdit(lead(), manager, { stageId: "s-lost", ownerId: "u-head", lostReasonId: "x" });
    expect(Object.keys(after).sort()).toEqual([
      "altPhone", "companyIds", "email", "location", "name", "nextActionAt", "phone", "requirement",
    ]);
  });
});

describe("contact fields need viewContact", () => {
  const blind: LeadEditActor = { ...owner, canViewContact: false };

  it("keeps the stored contact details when the form does not send them", () => {
    const { after, changed } = planLeadEdit(lead({ altPhone: "080 2222 3333" }), blind, { name: "Asha Rao K" });
    expect(changed).toEqual(["name"]);
    expect(after.phone).toBe("9845012345");
    expect(after.altPhone).toBe("080 2222 3333");
    expect(after.email).toBe("asha@example.com");
  });

  it("refuses any change to phone, alternate phone or email", () => {
    for (const form of [{ phone: "9000000001" }, { altPhone: "9000000002" }, { email: "x@y.com" }]) {
      const err = refusal(() => planLeadEdit(lead(), blind, form));
      expect(err.kind).toBe("forbidden");
      expect(err.needs).toBe("viewContact");
    }
  });

  it("accepts the stored value sent back unchanged", () => {
    expect(planLeadEdit(lead(), blind, { phone: "9845012345", email: "asha@example.com" }).changed).toEqual([]);
  });
});

describe("lost leads", () => {
  it("lets a lost lead be corrected, name and phone included", () => {
    expect(planLeadEdit(lead({ stageKind: "LOST" }), owner, { name: "Asha Rao", phone: "9845099999" }).changed)
      .toEqual(["phone"]);
  });

  it("refuses to schedule a next action on a lost lead, but allows clearing it", () => {
    expect(refusal(() => planLeadEdit(lead({ stageKind: "LOST" }), owner, { nextActionAt: "2026-10-01" })).message)
      .toMatch(/lost lead/);
    expect(planLeadEdit(lead({ stageKind: "LOST" }), owner, { nextActionAt: "" }).changed).toEqual(["nextActionAt"]);
  });
});

describe("duplicate relinking", () => {
  const at = (n: number) => new Date(Date.UTC(2026, 0, n));
  const c = (id: string, phone: string, day: number, duplicateOfId: string | null = null): PhoneCandidate =>
    ({ id, phone, createdAt: at(day), duplicateOfId });

  it("links to the earliest other lead with the number, matched loosely", () => {
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("B", "098450 12345", 5),
      c("A", "+91 98450 12345", 2),
      c("X", "9000000000", 1),
    ]);
    expect(plan).toEqual({ duplicateOfId: "A", repoint: [] });
  });

  it("links to nothing when no other lead has the number, or the number is too short", () => {
    expect(planDuplicateRelink("L1", "9845012345", [c("X", "9000000000", 1)]).duplicateOfId).toBeNull();
    expect(planDuplicateRelink("L1", "1234567", [c("X", "1234567", 1)]).duplicateOfId).toBeNull();
  });

  it("never links a lead to itself", () => {
    expect(planDuplicateRelink("L1", "9845012345", [c("L1", "9845012345", 1)]).duplicateOfId).toBeNull();
  });

  it("re-points leads that duplicated the old number, and the edited lead may then link on", () => {
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("D2", "9111111111", 9, "L1"),
      c("D1", "9111111111", 4, "L1"),
      c("B", "9845012345", 3),
    ]);
    expect(plan.duplicateOfId).toBe("B");
    expect(plan.repoint).toEqual([
      { id: "D2", duplicateOfId: "D1" },
      { id: "D1", duplicateOfId: null },
    ]);
  });

  it("keeps a lead that others still point at as an original, so links never chain", () => {
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("D", "9845012345", 6, "L1"),
      c("B", "9845012345", 2),
    ]);
    expect(plan).toEqual({ duplicateOfId: null, repoint: [] });
  });

  it("never links to a lead whose own chain leads back to the edited lead", () => {
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("A", "9845012345", 1, "Q"),
      c("Q", "9222222222", 2, "Z"),
      c("B", "9845012345", 3),
    ]);
    expect(plan.duplicateOfId).toBe("A");

    const looped = planDuplicateRelink("L1", "9845012345", [
      c("A", "9845012345", 1, "M"),
      c("M", "9333333333", 2, "A"),
      c("B", "9845012345", 3),
    ]);
    expect(looped.duplicateOfId).toBe("B");
  });
});

describe("audit", () => {
  it("masks contact values but still records that they changed", () => {
    const masked = maskChanges({
      phone: { from: "9845012345", to: "9845099345" },
      email: { from: "asha@example.com", to: null },
      name: { from: "Asha", to: "Asha Rao" },
    })!;
    expect(Object.keys(masked)).toEqual(["phone", "email", "name"]);
    expect(masked.phone.from).toBe("••••••2345");
    expect(masked.phone.to).toBe("••••••9345");
    expect(masked.email).toEqual({ from: "a•••@example.com", to: null });
    expect(masked.name).toEqual({ from: "Asha", to: "Asha Rao" });
    expect(JSON.stringify(masked)).not.toContain("9845012345");
  });

  it("names the fields in the summary, never the values", () => {
    expect(editSummary("LD00001", ["phone", "location"], 0)).toBe("Edited lead LD00001 — mobile number and location");
    expect(editSummary("LD00001", ["name"], 2)).toMatch(/2 other leads/);
  });
});

describe("dateInputValue reads the day as it is in India", () => {
  it("shows a follow-up stored for early morning IST on that same day, not the day before", () => {
    expect(dateInputValue(new Date("2026-10-04T19:00:00.000Z"))).toBe("2026-10-05");
  });

  it("reads back a date typed in the app unchanged", () => {
    expect(dateInputValue(new Date("2026-10-05"))).toBe("2026-10-05");
  });

  it("is blank when no follow-up is set", () => {
    expect(dateInputValue(null)).toBe("");
  });
});
