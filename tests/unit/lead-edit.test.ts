import { describe, expect, it } from "vitest";

import {
  dateInputValue, editRefusal, editSummary, identityLocked, LeadEditError, maskChanges,
  planDuplicateRelink, planLeadEdit,
  type EditableLead, type LeadEditActor, type PhoneCandidate,
} from "@/lib/sales/lead-edit";

const lead = (over: Partial<EditableLead> = {}): EditableLead => ({
  id: "L1",
  ownerId: "u-owner",
  state: "CONTACTED",
  hasBooking: false,
  name: "Asha Rao",
  phone: "9845012345",
  altPhone: null,
  email: "asha@example.com",
  sourceId: "src-1",
  projectId: null,
  unitTypeId: null,
  budgetMin: 5_000_000,
  budgetMax: 7_000_000,
  requirement: "2 BHK",
  nextActionAt: new Date("2026-09-20T03:30:00.000Z"),
  ...over,
});

const owner: LeadEditActor = { id: "u-owner", canViewAll: false, canViewContact: true };
const manager: LeadEditActor = { id: "u-head", canViewAll: true, canViewContact: true };

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
    expect(editRefusal({ ...owner, id: "u-other" }, lead({ ownerId: null }))).not.toBeNull();

    const err = refusal(() => planLeadEdit(lead(), { ...owner, id: "u-other" }, { name: "Changed" }));
    expect(err.kind).toBe("forbidden");
    expect(err.needs).toBe("viewAll");
  });
});

describe("what changes", () => {
  it("reports only the fields that differ, and keeps what the form leaves out", () => {
    const { changed, after } = planLeadEdit(lead(), owner, { name: "Asha R. Rao", budgetMax: "8000000" });
    expect(changed).toEqual(["name", "budgetMax"]);
    expect(after.phone).toBe("9845012345");
    expect(after.email).toBe("asha@example.com");
    expect(after.budgetMin).toBe(5_000_000);
  });

  it("blanks optional fields to null when the form clears them", () => {
    const { changed, after } = planLeadEdit(lead(), owner, { email: "", requirement: "  ", budgetMin: "", nextActionAt: "" });
    expect(after.email).toBeNull();
    expect(after.requirement).toBeNull();
    expect(after.budgetMin).toBeNull();
    expect(after.nextActionAt).toBeNull();
    expect(changed).toEqual(["email", "budgetMin", "requirement", "nextActionAt"]);
  });

  it("applies the capture rules", () => {
    expect(refusal(() => planLeadEdit(lead(), owner, { name: "A" })).message).toBe("Name is required");
    expect(refusal(() => planLeadEdit(lead(), owner, { email: "not-an-email" })).message).toBe("Enter a valid email");
    expect(refusal(() => planLeadEdit(lead(), owner, { phone: "123" })).message).toMatch(/phone/);
    expect(refusal(() => planLeadEdit(lead(), owner, { sourceId: "" })).message).toBe("Lead source is required");
    expect(refusal(() => planLeadEdit(lead(), owner, { budgetMin: "-5" })).message).toMatch(/Budget from/);
    expect(refusal(() => planLeadEdit(lead(), owner, { nextActionAt: "next week" })).message).toMatch(/date/);
  });

  it("refuses a budget from above budget to — including against the stored other end", () => {
    expect(refusal(() => planLeadEdit(lead(), owner, { budgetMin: "9000000", budgetMax: "8000000" })).message)
      .toBe("Budget from is more than budget to.");
    expect(refusal(() => planLeadEdit(lead(), owner, { budgetMin: "7500000" })).kind).toBe("invalid");
    expect(planLeadEdit(lead(), owner, { budgetMin: "7000000" }).changed).toEqual(["budgetMin"]);
  });

  it("keeps an untouched next action date at its stored time, and replaces a changed one", () => {
    const stored = lead();
    const same = planLeadEdit(stored, owner, { nextActionAt: dateInputValue(stored.nextActionAt) });
    expect(same.changed).toEqual([]);
    expect(same.after.nextActionAt).toBe(stored.nextActionAt);

    const moved = planLeadEdit(stored, owner, { nextActionAt: "2026-09-25" });
    expect(moved.changed).toEqual(["nextActionAt"]);
    expect(moved.after.nextActionAt?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("never touches stage, owner or anything outside the editable fields", () => {
    const { after } = planLeadEdit(lead(), manager, { state: "BOOKED", ownerId: "u-head", lostReasonId: "x", name: "Asha Rao" });
    expect(Object.keys(after)).not.toContain("state");
    expect(Object.keys(after)).not.toContain("ownerId");
    expect(Object.keys(after)).not.toContain("lostReasonId");
  });
});

describe("contact fields need viewContact", () => {
  const blind: LeadEditActor = { id: "u-owner", canViewAll: false, canViewContact: false };

  it("keeps the stored contact details when the form does not send them", () => {
    const { after, changed } = planLeadEdit(lead({ altPhone: "080 2222 3333" }), blind, { name: "Asha Rao K" });
    expect(changed).toEqual(["name"]);
    expect(after.phone).toBe("9845012345");
    expect(after.altPhone).toBe("080 2222 3333");
    expect(after.email).toBe("asha@example.com");
  });

  it("refuses any change to phone, alternate phone or email", () => {
    for (const form of [{ phone: "••••••2345" }, { altPhone: "9000000000" }, { email: "" }]) {
      const err = refusal(() => planLeadEdit(lead(), blind, form));
      expect(err.kind).toBe("forbidden");
      expect(err.needs).toBe("viewContact");
    }
  });

  it("accepts the stored value sent back unchanged", () => {
    expect(planLeadEdit(lead(), blind, { phone: "9845012345", email: "asha@example.com" }).changed).toEqual([]);
  });
});

describe("booked and lost leads", () => {
  it("fixes a booked lead's name and phone, whether by stage or by an existing booking", () => {
    expect(identityLocked({ state: "BOOKED", hasBooking: false })).toBe(true);
    expect(identityLocked({ state: "NEGOTIATION", hasBooking: true })).toBe(true);
    expect(identityLocked({ state: "LOST", hasBooking: false })).toBe(false);

    for (const l of [lead({ state: "BOOKED" }), lead({ state: "NEGOTIATION", hasBooking: true })]) {
      expect(refusal(() => planLeadEdit(l, owner, { name: "Someone else" })).message).toMatch(/booking/);
      expect(refusal(() => planLeadEdit(l, owner, { phone: "9000000001" })).message).toMatch(/booking/);
    }
  });

  it("still lets a booked lead's other details be corrected", () => {
    const { changed } = planLeadEdit(lead({ state: "BOOKED" }), owner, { email: "asha.rao@example.com", requirement: "3 BHK" });
    expect(changed).toEqual(["email", "requirement"]);
  });

  it("lets a lost lead be corrected, name and phone included", () => {
    expect(planLeadEdit(lead({ state: "LOST" }), owner, { name: "Asha Rao", phone: "9845099999" }).changed).toEqual(["phone"]);
  });

  it("refuses to schedule a next action on a closed lead, but allows clearing it", () => {
    for (const state of ["BOOKED", "LOST"]) {
      expect(refusal(() => planLeadEdit(lead({ state }), owner, { nextActionAt: "2026-10-01" })).message).toMatch(/open stage/);
      expect(planLeadEdit(lead({ state }), owner, { nextActionAt: "" }).changed).toEqual(["nextActionAt"]);
    }
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
    // L1 was the original for D1 and D2 (old number 9111111111); it now takes B's number.
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("D2", "9111111111", 9, "L1"),
      c("D1", "9111111111", 4, "L1"),
      c("B", "9845012345", 3),
    ]);
    expect(plan.duplicateOfId).toBe("B");
    // The earliest remaining becomes the original; the later one points at it.
    expect(plan.repoint).toEqual([
      { id: "D2", duplicateOfId: "D1" },
      { id: "D1", duplicateOfId: null },
    ]);
  });

  it("keeps a lead that others still point at as an original, so links never chain", () => {
    // D shares the new number and still points at L1: L1 must not become B's duplicate.
    const plan = planDuplicateRelink("L1", "9845012345", [
      c("D", "9845012345", 6, "L1"),
      c("B", "9845012345", 2),
    ]);
    expect(plan).toEqual({ duplicateOfId: null, repoint: [] });
  });

  it("never links to a lead whose own chain leads back to the edited lead", () => {
    // A → Q → L1 already (stale data); B is later but safe.
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
    expect(editSummary("LD-0001", ["phone", "budgetMax"], 0)).toBe("Edited lead LD-0001 — phone and budget to");
    expect(editSummary("LD-0001", ["name"], 2)).toMatch(/2 other leads/);
  });
});
