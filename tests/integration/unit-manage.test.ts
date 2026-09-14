import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, tag } from "./helpers";

import * as unitActions from "@/app/(app)/units/actions";
import { changeUnitStatus, unitWriteErrorMessage, updateUnit } from "@/lib/units/unit-service";

bindCookieBox(cookieBox);

/**
 * Creating, editing, blocking and deleting units against the database, on a
 * throwaway project with its own block and unit type — never seeded units,
 * which other test files and agents share.
 */
describe("unit management", () => {
  const S = tag().toUpperCase();
  const PROJECT = `UMG-${S}`;
  const ALL = { canAccessAllProjects: true, projectIds: [] as string[] };
  let projectId: string;
  let blockId: string;
  let unitTypeId: string;
  let ownerId: string;

  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const newUnit = (unitNumber: string, over: Record<string, string> = {}) => form({
    projectId, blockId, unitTypeId, unitNumber, floorNumber: "2",
    carpetArea: "845", builtUpArea: "1010", superBuiltUpArea: "1245",
    facing: "East", plcTag: "corner", parkingSlots: "1", ...over,
  });
  const unitByNumber = (unitNumber: string) => prisma.unit.findFirstOrThrow({ where: { projectId, unitNumber } });

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    projectId = (await prisma.project.create({ data: { code: PROJECT, name: `Unit manage ${S}`, projectTypeId: type.id } })).id;
    blockId = (await prisma.block.create({ data: { projectId, code: `B${S}`, name: `Tower ${S}`, totalFloors: 10 } })).id;
    unitTypeId = (await prisma.unitType.create({ data: { code: `UM${S}`, name: `Manage type ${S}` } })).id;
    ownerId = (await actAs("owner@nninfra.example")).userId;
  });

  afterAll(async () => {
    await prisma.unitHold.deleteMany({ where: { unit: { projectId } } });
    await prisma.unit.deleteMany({ where: { projectId } });
    await prisma.block.deleteMany({ where: { projectId } });
    await prisma.unitType.deleteMany({ where: { id: unitTypeId } });
    await prisma.auditLog.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("creates an Available unit through the action, and refuses a duplicate number", async () => {
    await actAs("sales@nninfra.example");
    const refused = await unitActions.createUnitAction(newUnit("M-0101"));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("unit.unit.create");

    await actAs("owner@nninfra.example");
    const res = await unitActions.createUnitAction(newUnit("M-0101"));
    expect(res).toMatchObject({ ok: true });

    const stored = await unitByNumber("M-0101");
    expect(stored.status).toBe("AVAILABLE");
    expect([stored.blockId, stored.unitTypeId, stored.floorNumber, stored.plcTag]).toEqual([blockId, unitTypeId, 2, "CORNER"]);
    expect(Number(stored.superBuiltUpArea)).toBe(1245);
    expect(await prisma.auditLog.count({ where: { projectId, entity: "Unit", entityId: stored.id, action: "CREATE" } })).toBe(1);

    // The same number, differently written, is caught by the shared rule.
    const dup = await unitActions.createUnitAction(newUnit("m-01 01"));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/already exists/);

    // The same rules as the import: areas must nest and the floor must exist.
    const bad = await unitActions.createUnitAction(newUnit("M-0199", { floorNumber: "11", carpetArea: "2000" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/above Tower .*10 floors.*|Carpet area is more than/);

    // The database's own unique constraint maps to the same words.
    const p2002 = await prisma.unit.create({ data: { projectId, unitNumber: "M-0101" } }).catch((e: unknown) => e);
    expect(unitWriteErrorMessage(p2002, "M-0101")).toBe("Unit number M-0101 already exists in this project.");
  });

  it("edits a unit, and refuses an edit made against a stale copy", async () => {
    await actAs("owner@nninfra.example");
    const loaded = await unitByNumber("M-0101");

    const res = await unitActions.updateUnitAction(loaded.id, form({
      updatedAt: loaded.updatedAt.toISOString(),
      unitNumber: "M-0102", floorNumber: "3", facing: "North", superBuiltUpArea: "1300",
    }));
    expect(res).toMatchObject({ ok: true });
    const edited = await prisma.unit.findUniqueOrThrow({ where: { id: loaded.id } });
    expect([edited.unitNumber, edited.floorNumber, edited.facing, Number(edited.superBuiltUpArea)]).toEqual(["M-0102", 3, "North", 1300]);
    expect(Number(edited.carpetArea)).toBe(845); // not sent, so kept
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: loaded.id, action: "UPDATE" } });
    expect(Object.keys(audit.changes as object).sort()).toEqual(["facing", "floorNumber", "superBuiltUpArea", "unitNumber"]);

    // The copy loaded before that edit is now stale.
    const stale = await unitActions.updateUnitAction(loaded.id, form({ updatedAt: loaded.updatedAt.toISOString(), facing: "South" }));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toMatch(/changed since you opened it/);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: loaded.id } })).facing).toBe("North");

    // Moving to another project is never allowed.
    const moved = await prisma.$transaction((tx) =>
      updateUnit(tx, { unitId: loaded.id, expectedUpdatedAt: edited.updatedAt, changes: { projectId: "another" } }, ALL),
    ).catch((e: Error) => e);
    expect((moved as Error).message).toMatch(/Project cannot change/);
  });

  it("locks the unit's identity once it has a hold, leaving facing, PLC and parking editable", async () => {
    await actAs("owner@nninfra.example");
    const unit = await unitByNumber("M-0102");
    // A released hold still counts: a cost sheet or agreement may have been built on it.
    await prisma.unitHold.create({
      data: { unitId: unit.id, heldById: ownerId, expiresAt: new Date(Date.now() - 86_400_000), isActive: false, releasedAt: new Date() },
    });

    for (const [field, value] of [["superBuiltUpArea", "1400"], ["unitNumber", "M-0999"], ["floorNumber", "4"], ["unitTypeId", ""]] as const) {
      const current = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
      const res = await unitActions.updateUnitAction(unit.id, form({ updatedAt: current.updatedAt.toISOString(), [field]: value }));
      expect(res.ok, field).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/cannot change: Locked — this unit has a hold/);
    }

    const current = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    const ok = await unitActions.updateUnitAction(unit.id, form({
      updatedAt: current.updatedAt.toISOString(), facing: "West", plcTag: "park facing", parkingSlots: "2",
      // Sent unchanged, as a form with enabled fields would: not a change, so not refused.
      superBuiltUpArea: "1300",
    }));
    expect(ok).toMatchObject({ ok: true });
    const after = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect([after.facing, after.plcTag, after.parkingSlots, after.unitNumber, Number(after.superBuiltUpArea)])
      .toEqual(["West", "PARK_FACING", 2, "M-0102", 1300]);
  });

  it("blocks and unblocks by hand, never touches sales statuses, and loses to a concurrent hold", async () => {
    await actAs("owner@nninfra.example");
    expect(await unitActions.createUnitAction(newUnit("M-0201"))).toMatchObject({ ok: true });
    const unit = await unitByNumber("M-0201");

    const noReason = await unitActions.changeUnitStatusAction(unit.id, "AVAILABLE", "BLOCKED", "  ");
    expect(noReason.ok).toBe(false);

    expect(await unitActions.changeUnitStatusAction(unit.id, "AVAILABLE", "BLOCKED", "Landowner share")).toMatchObject({ ok: true });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("BLOCKED");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: unit.id, summary: { contains: "Landowner share" } } });
    expect(audit.changes).toEqual({ status: { from: "AVAILABLE", to: "BLOCKED" } });

    expect(await unitActions.changeUnitStatusAction(unit.id, "BLOCKED", "AVAILABLE", "")).toMatchObject({ ok: true });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");

    // Sales statuses are neither set nor cleared here.
    const toBooked = await unitActions.changeUnitStatusAction(unit.id, "AVAILABLE", "BOOKED", "r");
    expect(toBooked.ok).toBe(false);

    // A hold lands after the user loaded the row as Available: the guarded write loses.
    await prisma.unit.update({ where: { id: unit.id }, data: { status: "HELD" } });
    const lost = await prisma.$transaction((tx) =>
      changeUnitStatus(tx, { unitId: unit.id, expected: "AVAILABLE", to: "BLOCKED", reason: "Too late" }),
    ).catch((e: Error) => e);
    expect((lost as Error).message).toMatch(/is now held/);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("HELD");

    const clearHeld = await unitActions.changeUnitStatusAction(unit.id, "HELD", "AVAILABLE", "");
    expect(clearHeld.ok).toBe(false);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("HELD");
  });

  it("deletes an untouched unit and refuses one that has a hold", async () => {
    await actAs("owner@nninfra.example");
    expect(await unitActions.createUnitAction(newUnit("M-0301"))).toMatchObject({ ok: true });
    const untouched = await unitByNumber("M-0301");

    await actAs("saleshead@nninfra.example");
    const noPerm = await unitActions.deleteUnitAction(untouched.id);
    expect(noPerm.ok).toBe(false);
    if (!noPerm.ok) expect(noPerm.code).toBe("unit.unit.delete");

    await actAs("owner@nninfra.example");
    expect(await unitActions.deleteUnitAction(untouched.id)).toMatchObject({ ok: true });
    expect(await prisma.unit.findUnique({ where: { id: untouched.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: untouched.id, action: "DELETE" } })).toBe(1);

    const held = await unitByNumber("M-0102");
    const refused = await unitActions.deleteUnitAction(held.id);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/it has a hold\. Block it instead/);
    expect(await prisma.unit.findUnique({ where: { id: held.id } })).not.toBeNull();

    expect(unitWriteErrorMessage({ code: "P2003" })).toMatch(/cannot be deleted\. Block it instead/);
  });
});
