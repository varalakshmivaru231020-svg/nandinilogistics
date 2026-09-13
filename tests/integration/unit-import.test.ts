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
import { writeUnitImport } from "@/lib/units/import-service";
import { planUnitImport, unitKey, type UnitImportInput } from "@/lib/units/unit-import";

bindCookieBox(cookieBox);

/**
 * Unit import against the database, on a throwaway project with its own block
 * and unit type — never the seeded project, which other test files share.
 */
describe("unit import", () => {
  const S = tag().toUpperCase();
  const PROJECT = `UIM-${S}`;
  let projectId: string;
  let blockId: string;
  let unitTypeId: string;

  const headers = ["Project", "Block", "Unit number", "Unit type", "Floor", "Carpet area", "Super built-up area", "Facing", "PLC tag"];
  const sheet = (rows: string[][]) => ({
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
  });
  const rows = [
    [PROJECT, `Tower ${S}`, "T-0101", `Type ${S}`, "1", "845", "1245", "East", "corner"],
    [PROJECT, `Tower ${S}`, "T-0102", `Type ${S}`, "1", "1120", "1655", "", ""],
  ];

  async function lookups() {
    const [projects, blocks, unitTypes, existing] = await Promise.all([
      prisma.project.findMany({ select: { id: true, code: true } }),
      prisma.block.findMany({ where: { projectId }, select: { id: true, projectId: true, code: true, name: true, totalFloors: true } }),
      prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true } }),
      prisma.unit.findMany({ where: { projectId }, select: { projectId: true, unitNumber: true } }),
    ]);
    return {
      projects,
      accessibleProjectIds: new Set([projectId]),
      blocks,
      unitTypes,
      existingUnits: new Set(existing.map((u) => unitKey(u.projectId, u.unitNumber))),
    };
  }

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    projectId = (await prisma.project.create({ data: { code: PROJECT, name: `Unit import ${S}`, projectTypeId: type.id } })).id;
    blockId = (await prisma.block.create({ data: { projectId, code: `B${S}`, name: `Tower ${S}`, totalFloors: 10 } })).id;
    unitTypeId = (await prisma.unitType.create({ data: { code: `UT${S}`, name: `Type ${S}` } })).id;
  });

  afterAll(async () => {
    await prisma.unit.deleteMany({ where: { projectId } });
    await prisma.block.deleteMany({ where: { projectId } });
    await prisma.unitType.deleteMany({ where: { id: unitTypeId } });
    await prisma.auditLog.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("plans, writes every row in one transaction, and stores them Available", async () => {
    const plan = planUnitImport(sheet(rows), await lookups());
    expect(plan.rows.map((r) => r.errors)).toEqual([[], []]);

    const inputs = plan.rows.map((r) => r.input!);
    const { created } = await prisma.$transaction((tx) => writeUnitImport(tx, inputs));
    expect(created).toBe(2);

    const stored = await prisma.unit.findMany({ where: { projectId }, orderBy: { unitNumber: "asc" } });
    expect(stored.map((u) => u.unitNumber)).toEqual(["T-0101", "T-0102"]);
    expect(stored.every((u) => u.status === "AVAILABLE" && u.blockId === blockId && u.unitTypeId === unitTypeId)).toBe(true);
    expect(Number(stored[0].carpetArea)).toBe(845);
    expect(Number(stored[0].superBuiltUpArea)).toBe(1245);
    expect(stored[0].plcTag).toBe("CORNER");
    expect(stored[1].facing).toBeNull();
  });

  it("refuses the same units when the file is planned again", async () => {
    const plan = planUnitImport(sheet(rows), await lookups());
    expect(plan.valid).toBe(0);
    expect(plan.rows[0].errors.join()).toMatch(/already exists/);
  });

  it("rolls the whole write back when one row fails", async () => {
    const good: UnitImportInput = {
      projectId, blockId, unitTypeId, unitNumber: "T-0901", floorNumber: 9,
      carpetArea: 800, builtUpArea: 0, superBuiltUpArea: 1200, facing: null, plcTag: null, parkingSlots: 0,
    };
    const before = await prisma.unit.count({ where: { projectId } });

    // A number the column cannot hold fails in the database, after the good row is in the batch.
    await expect(
      prisma.$transaction((tx) => writeUnitImport(tx, [good, { ...good, unitNumber: "T-0902", floorNumber: 3_000_000_000 }])),
    ).rejects.toThrow();
    // A duplicate caught by the writer's own re-check.
    await expect(
      prisma.$transaction((tx) => writeUnitImport(tx, [good, { ...good, unitNumber: "t-01 01" }])),
    ).rejects.toThrow(/already exists/);

    expect(await prisma.unit.count({ where: { projectId } })).toBe(before);
    expect(await prisma.unit.findFirst({ where: { projectId, unitNumber: "T-0901" } })).toBeNull();
  });

  it("imports through the action from an uploaded CSV, and refuses someone without the permission", async () => {
    const csv = `${headers.join(",")}\r\n${PROJECT},Tower ${S},T-0201,Type ${S},2,845,1245,,\r\n${PROJECT},Tower ${S},T-0101,Type ${S},2,845,1245,,\r\n`;
    const form = () => {
      const fd = new FormData();
      fd.set("file", new File([csv], "units.csv", { type: "text/csv" }));
      return fd;
    };

    await actAs("sales@nninfra.example");
    const refused = await unitActions.importUnitsAction(form());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("unit.unit.import");

    await actAs("owner@nninfra.example");
    const preview = await unitActions.previewUnitImportAction(form());
    expect(preview.ok).toBe(true);
    if (preview.ok) expect([preview.data.valid, preview.data.invalid]).toEqual([1, 1]);

    const res = await unitActions.importUnitsAction(form());
    expect(res.ok).toBe(true);
    if (res.ok) expect([res.data.created, res.data.skipped]).toEqual([1, 1]);
    expect(await prisma.unit.findFirst({ where: { projectId, unitNumber: "T-0201" }, select: { status: true } }))
      .toEqual({ status: "AVAILABLE" });
  });
});
