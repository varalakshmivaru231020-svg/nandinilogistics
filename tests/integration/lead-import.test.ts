import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { planLeadImport } from "@/lib/sales/lead-import";
import { phoneKey } from "@/lib/sales/lead-schema";
import { captureLead } from "@/lib/sales/lead-service";
import { prisma, seededUsers } from "./helpers";

/**
 * Lead capture and import against the database. Assignment runs in MANUAL
 * mode throughout: round-robin draws on every user holding the duty, which
 * other test files add and remove in parallel, so its distribution is covered
 * by the pure tests instead.
 */

// Seven digits unique to this run, inside a ten-digit mobile number.
const TAG = String(Date.now()).slice(-7);
const phone = (n: number) => `9${TAG}${String(n).padStart(2, "0")}`;

let ownerId: string;
let source: { id: string; name: string };

beforeAll(async () => {
  const { owner } = await seededUsers();
  ownerId = owner.id;
  const found = await prisma.leadSource.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  expect(found, "reference data has an active lead source").not.toBeNull();
  source = found!;
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { phone: { contains: TAG } } });
  await prisma.$disconnect();
});

const input = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Import test ${n}`,
  phone: phone(n),
  sourceId: source.id,
  unitTypeId: null,
  ...over,
});

describe("captureLead — the one path for the form and the import", () => {
  it("numbers the lead, gives it to whoever captured it in manual mode, and links a repeat number", async () => {
    const first = await prisma.$transaction((tx) => captureLead(tx, input(1), ownerId, "MANUAL", new Date()));
    expect(first.lead.leadNo).toBeTruthy();
    expect(first.auto).toBe(false);
    expect(first.duplicateOf).toBeNull();

    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: first.lead.id }, select: { ownerId: true, assignedAt: true } });
    expect(stored.ownerId).toBe(ownerId);
    expect(stored.assignedAt).not.toBeNull();

    const repeat = await prisma.$transaction((tx) => captureLead(tx, input(1, { name: "Import test 1 again" }), ownerId, "MANUAL", new Date()));
    expect(repeat.duplicateOf?.id).toBe(first.lead.id);
    expect(repeat.lead.leadNo).not.toBe(first.lead.leadNo);
  });

  it("finds the earlier lead from a loosely written number when planning an import", async () => {
    const earliest = await prisma.lead.findFirstOrThrow({
      where: { phone: phone(1) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

    const existing = await prisma.lead.findMany({
      where: { phone: { contains: TAG } },
      select: { id: true, name: true, phone: true },
      orderBy: { createdAt: "asc" },
    });
    const existingPhones = new Map<string, { id: string; name: string }>();
    for (const l of existing) if (!existingPhones.has(phoneKey(l.phone))) existingPhones.set(phoneKey(l.phone), l);

    const plan = planLeadImport(
      { headers: ["Name", "Mobile", "Source"], rows: [{ Name: "Loose number", Mobile: `+91 ${phone(1)}`, Source: source.name.toUpperCase() }] },
      { sources: [source], projects: [], unitTypes: [], owners: [], existingPhones, canAssign: false },
    );

    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.rows[0].input?.duplicateOfId).toBe(earliest.id);
    expect(plan.rows[0].notes).toEqual([`possible duplicate of ${earliest.name}`]);
  });

  it("writes nothing when one row of an import cannot be stored", async () => {
    const before = await prisma.lead.count({ where: { phone: { contains: TAG } } });

    await expect(
      prisma.$transaction(async (tx) => {
        await captureLead(tx, input(3), ownerId, "MANUAL", new Date());
        await captureLead(tx, input(4, { sourceId: "no-such-source" }), ownerId, "MANUAL", new Date());
      }),
    ).rejects.toThrow();

    expect(await prisma.lead.count({ where: { phone: { contains: TAG } } })).toBe(before);
    expect(await prisma.lead.findFirst({ where: { phone: phone(3) } })).toBeNull();
  });

  it("gives each imported row a later assignment instant, so none tie", async () => {
    const start = Date.now();
    const ids = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const n of [5, 6, 7]) {
        const r = await captureLead(tx, input(n), ownerId, "MANUAL", new Date(start + out.length));
        out.push(r.lead.id);
      }
      return out;
    });

    const rows = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, assignedAt: true } });
    const instants = ids.map((id) => rows.find((r) => r.id === id)!.assignedAt!.getTime());
    expect(new Set(instants).size).toBe(3);
    expect([...instants].sort((a, b) => a - b)).toEqual(instants);
  });
});
