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

import { holdUnitAction, releaseHoldAction } from "@/app/(app)/sales/cost-sheets/actions";
import { blockUnitForLeadAction } from "@/app/(app)/sales/leads/actions";

bindCookieBox(cookieBox);

/**
 * Holds and releases move a unit's status. Each move must be claimed against
 * the status it was checked at, so a block or booking made meanwhile is never
 * silently overwritten — and a unit may only be held by someone who can see
 * its project.
 */
describe("sales actions guard unit status", () => {
  const S = tag().toUpperCase();
  const PHONE = `9${String(Date.now()).slice(-9)}`;
  let projectId: string;
  let blockId: string;
  let leadId: string;
  const unitIds: string[] = [];

  async function makeUnit(status: "AVAILABLE" | "BLOCKED" = "AVAILABLE") {
    const unit = await prisma.unit.create({
      data: {
        projectId, blockId, unitNumber: `G-${S}-${unitIds.length}`, floorNumber: 1,
        carpetArea: 900, builtUpArea: 1000, superBuiltUpArea: 1200, status,
      },
    });
    unitIds.push(unit.id);
    return unit;
  }

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    // A project nobody is mapped to: only users who see every project reach it.
    projectId = (await prisma.project.create({ data: { code: `SG${S}`.slice(0, 20), name: `Sales guards ${S}`, projectTypeId: type.id } })).id;
    blockId = (await prisma.block.create({ data: { projectId, code: `B${S}`, name: `Tower ${S}`, totalFloors: 10 } })).id;
    const source = await prisma.leadSource.findFirstOrThrow({ where: { status: "ACTIVE" } });
    leadId = (await prisma.lead.create({
      data: { leadNo: `LD-SG-${S}`, name: `Guard test ${S}`, phone: PHONE, sourceId: source.id },
    })).id;
  });

  afterAll(async () => {
    await prisma.unitHold.deleteMany({ where: { unitId: { in: unitIds } } });
    await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
    await prisma.lead.deleteMany({ where: { id: leadId } });
    await prisma.block.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses to hold a unit for a lead in a project the user cannot access", async () => {
    const unit = await makeUnit();
    const sales = await actAs("sales@nninfra.example");
    const mapped = await prisma.userProject.count({ where: { userId: sales.userId, projectId } });
    expect(mapped).toBe(0);

    const res = await blockUnitForLeadAction(leadId, unit.id);
    expect(res.ok).toBe(false);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");
    expect(await prisma.unitHold.count({ where: { unitId: unit.id } })).toBe(0);
  });

  it("holds an available unit once, and refuses the second attempt", async () => {
    const unit = await makeUnit();
    await actAs("owner@nninfra.example");

    expect((await blockUnitForLeadAction(leadId, unit.id)).ok).toBe(true);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("HELD");

    const again = await blockUnitForLeadAction(leadId, unit.id);
    expect(again.ok).toBe(false);
    expect(await prisma.unitHold.count({ where: { unitId: unit.id, isActive: true } })).toBe(1);
  });

  it("will not hold a unit that is blocked from sale", async () => {
    const unit = await makeUnit("BLOCKED");
    await actAs("owner@nninfra.example");
    const res = await holdUnitAction(unit.id, null);
    expect(res.ok).toBe(false);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("BLOCKED");
    expect(await prisma.unitHold.count({ where: { unitId: unit.id } })).toBe(0);
  });

  it("releasing a hold frees the unit, and a second release is refused", async () => {
    const unit = await makeUnit();
    await actAs("owner@nninfra.example");
    expect((await holdUnitAction(unit.id, null)).ok).toBe(true);
    const hold = await prisma.unitHold.findFirstOrThrow({ where: { unitId: unit.id, isActive: true } });

    expect((await releaseHoldAction(hold.id, "Customer changed plans")).ok).toBe(true);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");

    const again = await releaseHoldAction(hold.id, "again");
    expect(again.ok).toBe(false);
  });

  it("releasing a hold never undoes a block made while the unit was held", async () => {
    const unit = await makeUnit();
    await actAs("owner@nninfra.example");
    expect((await holdUnitAction(unit.id, null)).ok).toBe(true);
    const hold = await prisma.unitHold.findFirstOrThrow({ where: { unitId: unit.id, isActive: true } });

    // Someone blocks the unit from sale while it is still held.
    await prisma.unit.update({ where: { id: unit.id }, data: { status: "BLOCKED" } });

    expect((await releaseHoldAction(hold.id, "Released after the block")).ok).toBe(true);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("BLOCKED");
    expect((await prisma.unitHold.findUniqueOrThrow({ where: { id: hold.id } })).isActive).toBe(false);
  });
});
