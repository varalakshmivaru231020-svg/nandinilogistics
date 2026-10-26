import { describe, expect, it } from "vitest";

import { masterImportColumns, planMasterImport } from "@/lib/masters/import";
import { getMaster } from "@/lib/masters/registry";

const designations = getMaster("designations")!;

const options = {
  departmentId: [
    { value: "dep-ops", label: "Operations" },
    { value: "dep-crm", label: "Tele-calling & Onboarding" },
    // Two departments share a name: resolving "Accounts" by name must refuse.
    { value: "dep-acc-1", label: "Accounts" },
    { value: "dep-acc-2", label: "Accounts" },
  ],
};

const headers = ["Code", "Name", "Department", "Status"];

function sheet(rows: string[][]) {
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

describe("masterImportColumns", () => {
  it("offers every form field plus status, required where the form requires", () => {
    const cols = masterImportColumns(designations);
    expect(cols.map((c) => c.key)).toEqual([...designations.fields.map((f) => f.name), "status"]);
    expect(cols.find((c) => c.key === "code")).toMatchObject({ label: "Code", required: true });
    expect(cols.find((c) => c.key === "departmentId")).toMatchObject({ label: "Department", aliases: ["department"] });
  });
});

describe("planMasterImport", () => {
  it("resolves dropdowns by name, case-insensitively, and prepares the same data the form would", () => {
    const plan = planMasterImport(designations, sheet([["tl", "Team Leader", "operations", ""]]), options, new Set());
    expect(plan.invalid).toBe(0);
    expect(plan.rows[0].data).toMatchObject({ code: "TL", name: "Team Leader", departmentId: "dep-ops", status: "ACTIVE" });
  });

  it("reports the required columns a file lacks, before reading any row", () => {
    const plan = planMasterImport(designations, { headers: ["Code"], rows: [{ Code: "X" }] }, options, new Set());
    expect(plan.missing).toEqual(["Name"]);
    expect(plan.rows).toEqual([]);
  });

  it("names an unknown dropdown value, and refuses to guess between two with the same name", () => {
    const plan = planMasterImport(
      designations,
      sheet([
        ["A1", "Thing", "Marketing"],
        ["A2", "Clerk", "Accounts"],
      ]),
      options,
      new Set(),
    );
    expect(plan.rows[0].errors).toContain('Department "Marketing" is not in the department list');
    expect(plan.rows[1].errors).toContain('Department "Accounts" matches more than one entry');
    expect(plan.valid).toBe(0);
  });

  it("applies the form's own validation — required fields", () => {
    const plan = planMasterImport(designations, sheet([["", "No code", "Operations"]]), options, new Set());
    expect(plan.rows[0].errors.join(" | ")).toMatch(/Code is required/);
  });

  it("refuses a code that already exists, or repeats within the file — naming the earlier row", () => {
    const plan = planMasterImport(
      designations,
      sheet([
        ["TL", "Team Leader", "Operations"],
        ["tele", "Tele-caller", "Operations"],
        ["TELE", "Tele-caller again", "Operations"],
      ]),
      options,
      new Set(["TL"]),
    );
    expect(plan.rows[0].errors).toEqual(["Code TL already exists"]);
    expect(plan.rows[1].errors).toEqual([]);
    expect(plan.rows[2].errors).toEqual(["Code TELE is repeated from row 3"]);
    expect(plan.rows.map((r) => r.row)).toEqual([2, 3, 4]);
  });

  it("reads status, and rejects anything but Active or Inactive", () => {
    const plan = planMasterImport(
      designations,
      sheet([
        ["I1", "One", "Operations", "Inactive"],
        ["I2", "Two", "Operations", "archived"],
      ]),
      options,
      new Set(),
    );
    expect(plan.rows[0].data?.status).toBe("INACTIVE");
    expect(plan.rows[1].errors).toContain('Status "archived" should be Active or Inactive');
  });

  it("gives a row with errors no data to write", () => {
    const plan = planMasterImport(designations, sheet([["", "", ""]]), options, new Set());
    expect(plan.rows[0].data).toBeUndefined();
  });
});
