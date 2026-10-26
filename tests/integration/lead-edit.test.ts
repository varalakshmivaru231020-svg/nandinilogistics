import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LeadEditError, type LeadEditActor } from "@/lib/sales/lead-edit";
import { applyLeadEdit } from "@/lib/sales/lead-edit-service";
import { prisma, seededUsers, stageOfKind } from "./helpers";

/**
 * Editing a lead against the database. Every lead here is throwaway: its phone
 * carries a tag unique to this run, and afterAll deletes by that tag — seeded
 * leads are never touched.
 */

const TAG = String(Date.now()).slice(-7);
const phone = (n: number) => `9${TAG}${String(n).padStart(2, "0")}`;

let actor: LeadEditActor;
let stageId: string;
let seq = 0;

beforeAll(async () => {
  const { teleCaller } = await seededUsers();
  actor = { id: teleCaller.id, canViewAll: false, canViewContact: true };
  stageId = (await stageOfKind("OPEN")).id;
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { phone: { contains: TAG } } });
  await prisma.$disconnect();
});

async function makeLead(n: number, over: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.lead.create({
    data: {
      leadNo: `LEDIT-${TAG}-${seq}`,
      name: `Edit test ${n}`,
      phone: phone(n),
      stageId,
      ownerId: actor.id,
      ...over,
    },
  });
}

const edit = (id: string, form: Record<string, unknown>, updatedAt: Date) =>
  prisma.$transaction((tx) => applyLeadEdit(tx, id, actor, form, updatedAt.toISOString()));

describe("applyLeadEdit", () => {
  it("persists an edit and records a field-level diff with the phone masked", async () => {
    const lead = await makeLead(1, { location: "Koramangala", requirement: "Has a bike" });

    const outcome = await edit(lead.id, {
      name: "Edit test one", phone: phone(1), location: "HSR Layout", requirement: "Has a scooter",
    }, lead.updatedAt);

    expect(outcome.updated).toBe(true);
    expect(outcome.changes).toEqual({
      name: { from: "Edit test 1", to: "Edit test one" },
      location: { from: "Koramangala", to: "HSR Layout" },
      requirement: { from: "Has a bike", to: "Has a scooter" },
    });
    expect(outcome.summary).toBe(`Edited lead ${lead.leadNo} — name, location and notes`);

    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.name).toBe("Edit test one");
    expect(stored.location).toBe("HSR Layout");
    expect(stored.requirement).toBe("Has a scooter");
    expect(stored.phone).toBe(phone(1));
    expect(stored.updatedAt.getTime()).toBeGreaterThan(lead.updatedAt.getTime());

    // A phone change is recorded, masked.
    const again = await edit(lead.id, { phone: phone(11) }, stored.updatedAt);
    expect(Object.keys(again.changes!)).toEqual(["phone"]);
    expect(JSON.stringify(again.changes)).not.toContain(phone(11));
    expect(JSON.stringify(again.changes)).not.toContain(phone(1));
  });

  it("writes nothing when nothing changed", async () => {
    const lead = await makeLead(2);
    const outcome = await edit(lead.id, { name: lead.name, phone: lead.phone }, lead.updatedAt);
    expect(outcome).toMatchObject({ updated: false, changes: null });
    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.updatedAt.getTime()).toBe(lead.updatedAt.getTime());
  });

  it("relinks duplicateOfId when the phone changes, and re-points leads that duplicated the old number", async () => {
    const a = await makeLead(20);                                       // the original for number 20
    const d = await makeLead(20, { duplicateOfId: a.id });              // its duplicate
    const b = await makeLead(21);                                       // someone with number 21
    const c = await makeLead(22);

    // C takes number 20, written loosely: it becomes a duplicate of A, the earliest.
    // (The tag stays contiguous so afterAll still finds this lead.)
    const cOut = await edit(c.id, { phone: `+91 ${phone(20)}` }, c.updatedAt);
    expect(cOut.changes?.duplicateOfId).toEqual({ from: null, to: a.id });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: c.id } })).duplicateOfId).toBe(a.id);

    // A moves to number 21. It is B's duplicate now; D and C, still on number 20,
    // no longer hang off A — the earlier of them becomes their original.
    const aNow = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
    const aOut = await edit(a.id, { phone: phone(21) }, aNow.updatedAt);
    expect(aOut.repointed.map((r) => [r.id, r.duplicateOfId]).sort()).toEqual([[c.id, d.id], [d.id, null]].sort());

    const rows = await prisma.lead.findMany({ where: { id: { in: [a.id, b.id, c.id, d.id] } }, select: { id: true, duplicateOfId: true } });
    const link = Object.fromEntries(rows.map((r) => [r.id, r.duplicateOfId]));
    expect(link).toEqual({ [a.id]: b.id, [b.id]: null, [c.id]: d.id, [d.id]: null });

    // Back to a number nobody else has: no link, and never to itself.
    const aAfter = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
    await edit(a.id, { phone: phone(23) }, aAfter.updatedAt);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).duplicateOfId).toBeNull();
  });

  it("refuses an edit made against a stale updatedAt, and writes nothing", async () => {
    const lead = await makeLead(30);
    await edit(lead.id, { requirement: "First edit" }, lead.updatedAt);

    const err = await edit(lead.id, { requirement: "Second edit, from an old form" }, lead.updatedAt).catch((e) => e);
    expect(err).toBeInstanceOf(LeadEditError);
    expect(err.kind).toBe("stale");
    expect(err.message).toMatch(/changed by someone else — reload/);

    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).requirement).toBe("First edit");
  });

  it("clears escalatedAt when the next action date changes, and only then", async () => {
    const lead = await makeLead(40, {
      nextActionAt: new Date("2026-01-05T03:30:00.000Z"),
      escalatedAt: new Date("2026-01-07T00:00:00.000Z"),
    });

    // Another field changes, the date is sent back untouched: the escalation stands.
    const first = await edit(lead.id, { requirement: "Villa", nextActionAt: "2026-01-05" }, lead.updatedAt);
    expect(Object.keys(first.changes!)).toEqual(["requirement"]);
    const kept = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(kept.escalatedAt).not.toBeNull();
    expect(kept.nextActionAt?.toISOString()).toBe("2026-01-05T03:30:00.000Z");

    await edit(lead.id, { nextActionAt: "2026-10-01" }, kept.updatedAt);
    const moved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(moved.nextActionAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(moved.escalatedAt).toBeNull();
  });

  it("refuses someone else's lead without viewAll", async () => {
    const { teleCaller2 } = await seededUsers();
    const lead = await makeLead(50, { ownerId: teleCaller2.id });
    const err = await edit(lead.id, { name: "Not mine" }, lead.updatedAt).catch((e) => e);
    expect(err).toBeInstanceOf(LeadEditError);
    expect(err.kind).toBe("forbidden");
  });
});
