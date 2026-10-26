import { afterAll, describe, expect, it } from "vitest";

import { planMasterImport } from "@/lib/masters/import";
import { getMaster } from "@/lib/masters/registry";
import { delegate, loadOptions } from "@/lib/masters/service";
import { prisma } from "./helpers";

/**
 * The masters import against the real tables: option names resolve to real
 * ids, the planned data is accepted by the database as-is, and a second pass
 * over the same file refuses every row it already imported.
 */

const TAG = `IMP${Date.now().toString(36).toUpperCase()}`;
const departments = getMaster("departments")!;
const designations = getMaster("designations")!;

async function existingCodes(def: typeof departments) {
  const rows: Array<{ code: string | null }> = await delegate(def).findMany({ select: { code: true } });
  return new Set(rows.map((r) => String(r.code ?? "").toUpperCase()));
}

afterAll(async () => {
  await prisma.department.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("masters import against the database", () => {
  it("resolves a real department name to its id", async () => {
    const department = await prisma.department.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    expect(department, "reference data has an active department").toBeTruthy();

    const headers = ["Code", "Name", "Department"];
    const plan = planMasterImport(
      designations,
      { headers, rows: [{ Code: `-DESIG`, Name: "Imported designation", Department: department!.name.toUpperCase() }] },
      await loadOptions(designations),
      await existingCodes(designations),
    );

    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.rows[0].data).toMatchObject({ departmentId: department!.id });
  });

  it("writes the planned rows as they are, then refuses the same file a second time", async () => {
    const headers = ["Code", "Name", "Description", "Status"];
    const sheet = {
      headers,
      rows: [
        { Code: `${TAG}-a`, Name: "Imported one", Description: "", Status: "" },
        { Code: `${TAG}-B`, Name: "Imported two", Description: "From a sheet", Status: "Inactive" },
        { Code: "", Name: "No code", Description: "", Status: "" },
      ],
    };

    const first = planMasterImport(departments, sheet, await loadOptions(departments), await existingCodes(departments));
    expect(first.valid).toBe(2);
    expect(first.invalid).toBe(1);

    const data = first.rows.flatMap((r) => (r.data ? [r.data] : []));
    const { count } = await delegate(departments).createMany({ data });
    expect(count).toBe(2);

    const stored = await prisma.department.findMany({
      where: { code: { startsWith: TAG } },
      select: { code: true, name: true, status: true, description: true },
      orderBy: { code: "asc" },
    });
    expect(stored).toEqual([
      { code: `${TAG}-A`, name: "Imported one", status: "ACTIVE", description: null },
      { code: `${TAG}-B`, name: "Imported two", status: "INACTIVE", description: "From a sheet" },
    ]);

    const second = planMasterImport(departments, sheet, await loadOptions(departments), await existingCodes(departments));
    expect(second.valid).toBe(0);
    expect(second.rows[0].errors).toEqual([`Code ${TAG}-A already exists`]);
    expect(second.rows[1].errors).toEqual([`Code ${TAG}-B already exists`]);
  });
});
