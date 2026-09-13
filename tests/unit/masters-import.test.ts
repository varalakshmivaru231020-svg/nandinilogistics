import { describe, expect, it } from "vitest";

import { masterImportColumns, planMasterImport } from "@/lib/masters/import";
import { getMaster } from "@/lib/masters/registry";

const items = getMaster("items")!;

const options = {
  categoryId: [
    { value: "cat-cement", label: "Cement" },
    { value: "cat-steel", label: "Steel" },
    // Two categories share a name: resolving "Finishes" by name must refuse.
    { value: "cat-fin-1", label: "Finishes" },
    { value: "cat-fin-2", label: "Finishes" },
  ],
  uomId: [
    { value: "uom-bag", label: "Bags" },
    { value: "uom-kg", label: "Kilogram" },
  ],
  taxRateId: [{ value: "tax-18", label: "GST 18%" }],
};

const headers = ["Code", "Name", "Category", "Unit of measure", "Standard rate (₹)", "Is a capital asset", "Status"];

function sheet(rows: string[][]) {
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

describe("masterImportColumns", () => {
  it("offers every form field plus status, required where the form requires", () => {
    const cols = masterImportColumns(items);
    expect(cols.map((c) => c.key)).toEqual([...items.fields.map((f) => f.name), "status"]);
    expect(cols.find((c) => c.key === "categoryId")).toMatchObject({ label: "Category", required: true, aliases: ["category"] });
  });
});

describe("planMasterImport", () => {
  it("resolves dropdowns by name, case-insensitively, and prepares the same data the form would", () => {
    const plan = planMasterImport(items, sheet([["cem-53", "OPC 53 Cement", "cement", "BAGS", "₹412.50", "no", ""]]), options, new Set());
    expect(plan.invalid).toBe(0);
    expect(plan.rows[0].data).toMatchObject({
      code: "CEM-53", name: "OPC 53 Cement", categoryId: "cat-cement", uomId: "uom-bag",
      standardRate: 412.5, isAsset: false, status: "ACTIVE",
    });
  });

  it("reports the required columns a file lacks, before reading any row", () => {
    const plan = planMasterImport(items, { headers: ["Code", "Name"], rows: [{ Code: "X", Name: "Y" }] }, options, new Set());
    expect(plan.missing).toEqual(["Category", "Unit of measure"]);
    expect(plan.rows).toEqual([]);
  });

  it("names an unknown dropdown value, and refuses to guess between two with the same name", () => {
    const plan = planMasterImport(
      items,
      sheet([
        ["A1", "Thing", "Timber", "Bags"],
        ["A2", "Tiles", "Finishes", "Bags"],
      ]),
      options,
      new Set(),
    );
    expect(plan.rows[0].errors).toContain('Category "Timber" is not in the category list');
    expect(plan.rows[1].errors).toContain('Category "Finishes" matches more than one entry');
    expect(plan.valid).toBe(0);
  });

  it("applies the form's own validation — required fields and numbers", () => {
    const plan = planMasterImport(items, sheet([["", "No code", "Cement", "Bags", "a lot"]]), options, new Set());
    const errors = plan.rows[0].errors.join(" | ");
    expect(errors).toMatch(/Code is required/);
    expect(errors).toMatch(/must be a number/);
  });

  it("refuses a code that already exists, or repeats within the file — naming the earlier row", () => {
    const plan = planMasterImport(
      items,
      sheet([
        ["STL-8", "TMT 8mm", "Steel", "Kilogram"],
        ["cem-43", "OPC 43", "Cement", "Bags"],
        ["CEM-43", "OPC 43 again", "Cement", "Bags"],
      ]),
      options,
      new Set(["STL-8"]),
    );
    expect(plan.rows[0].errors).toEqual(["Code STL-8 already exists"]);
    expect(plan.rows[1].errors).toEqual([]);
    expect(plan.rows[2].errors).toEqual(["Code CEM-43 is repeated from row 3"]);
    expect(plan.rows.map((r) => r.row)).toEqual([2, 3, 4]);
  });

  it("reads status, and rejects anything but Active or Inactive", () => {
    const plan = planMasterImport(
      items,
      sheet([
        ["I1", "One", "Cement", "Bags", "", "", "Inactive"],
        ["I2", "Two", "Cement", "Bags", "", "", "archived"],
      ]),
      options,
      new Set(),
    );
    expect(plan.rows[0].data?.status).toBe("INACTIVE");
    expect(plan.rows[1].errors).toContain('Status "archived" should be Active or Inactive');
  });

  it("gives a row with errors no data to write", () => {
    const plan = planMasterImport(items, sheet([["", "", "", ""]]), options, new Set());
    expect(plan.rows[0].data).toBeUndefined();
  });
});
