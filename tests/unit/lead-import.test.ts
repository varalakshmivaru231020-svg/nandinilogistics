import { describe, expect, it } from "vitest";

import { LEAD_IMPORT_COLUMNS, planLeadImport, type LeadImportLookups } from "@/lib/sales/lead-import";
import { phoneKey } from "@/lib/sales/lead-schema";

const lookups = (over: Partial<LeadImportLookups> = {}): LeadImportLookups => ({
  sources: [{ id: "src-web", name: "Website" }, { id: "src-walk", name: "Walk-in" }],
  projects: [{ id: "prj-nns", code: "NNS", name: "NN Skyline" }],
  unitTypes: [{ id: "ut-2", name: "2 BHK" }, { id: "ut-3", name: "3 BHK" }],
  owners: [{ id: "u-meera", email: "meera@nninfra.in", employeeCode: "EMP014", name: "Meera" }],
  existingPhones: new Map([["9845012345", { id: "lead-old", name: "Anita Sharma" }]]),
  canAssign: false,
  ...over,
});

function sheet(headers: string[], rows: string[][]) {
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

describe("phoneKey", () => {
  it("treats +91, a leading zero and spacing as the same number", () => {
    expect(phoneKey("+91 98450 12345")).toBe("9845012345");
    expect(phoneKey("098450-12345")).toBe("9845012345");
    expect(phoneKey("9845012345")).toBe("9845012345");
  });
});

describe("planLeadImport", () => {
  it("accepts the columns a portal export typically uses, and resolves names to ids", () => {
    const plan = planLeadImport(
      sheet(
        ["Customer Name", "Mobile", "Source", "Project", "Configuration", "Min Budget", "Max Budget", "Remarks", "Follow-up date"],
        [["Ravi Kumar", "98860 11223", "website", "nns", "2 bhk", "₹75,00,000", "90,00,000", "East facing", "05/10/2026"]],
      ),
      lookups(),
    );
    expect(plan.missing).toEqual([]);
    expect(plan.invalid).toBe(0);
    expect(plan.rows[0].input).toMatchObject({
      name: "Ravi Kumar", phone: "98860 11223", sourceId: "src-web", projectId: "prj-nns", unitTypeId: "ut-2",
      budgetMin: 7500000, budgetMax: 9000000, requirement: "East facing", nextActionAt: "2026-10-05",
      ownerId: null, duplicateOfId: null,
    });
  });

  it("names the required columns that are missing", () => {
    const plan = planLeadImport(sheet(["Name", "Phone"], [["A", "1"]]), lookups());
    expect(plan.missing).toEqual(["Lead source"]);
  });

  it("applies the New Lead form's own rules", () => {
    const plan = planLeadImport(
      sheet(["Name", "Phone", "Lead source", "Email"], [["R", "123", "Website", "not-an-email"]]),
      lookups(),
    );
    expect(plan.rows[0].errors).toEqual(
      expect.arrayContaining(["Name is required", "A valid phone number is required", "Enter a valid email"]),
    );
    expect(plan.rows[0].input).toBeUndefined();
  });

  it("reports an unknown source, project or unit type by name", () => {
    const plan = planLeadImport(
      sheet(["Name", "Phone", "Lead source", "Project", "Interested in"], [["Ravi", "9886011223", "Billboard", "Atlantis", "Villa"]]),
      lookups(),
    );
    expect(plan.rows[0].errors).toEqual([
      'Lead source "Billboard" is not recognised',
      'Project "Atlantis" is not recognised',
      'Interested in "Villa" is not recognised',
    ]);
  });

  it("refuses dates it cannot read, budgets that are not numbers, and a budget range backwards", () => {
    const plan = planLeadImport(
      sheet(
        ["Name", "Phone", "Lead source", "Next action on", "Budget from", "Budget to"],
        [
          ["Ravi", "9886011223", "Website", "next week", "", ""],
          ["Asha", "9886011224", "Website", "", "lots", ""],
          ["Uma", "9886011225", "Website", "", "90,00,000", "75,00,000"],
        ],
      ),
      lookups(),
    );
    expect(plan.rows[0].errors).toEqual(['Next action on "next week" is not a date']);
    expect(plan.rows[1].errors).toEqual(["Budget from must be a number of rupees"]);
    expect(plan.rows[2].errors).toEqual(["Budget from is more than budget to"]);
  });

  it("flags — but still imports — a number already captured, or repeated in the file", () => {
    const plan = planLeadImport(
      sheet(["Name", "Phone", "Lead source"], [
        ["Anita S", "+91 98450 12345", "Website"],
        ["Kiran", "9886011223", "Walk-in"],
        ["Kiran again", "09886011223", "Walk-in"],
      ]),
      lookups(),
    );
    expect(plan.invalid).toBe(0);
    expect(plan.rows[0].notes).toEqual(["possible duplicate of Anita Sharma"]);
    expect(plan.rows[0].input?.duplicateOfId).toBe("lead-old");
    expect(plan.rows[1].notes).toEqual([]);
    expect(plan.rows[2].notes).toEqual(["same phone as row 3"]);
  });

  it("lets only someone who may assign leads choose the owner", () => {
    const rows = sheet(["Name", "Phone", "Lead source", "Owner"], [["Ravi", "9886011223", "Website", "EMP014"]]);

    const barred = planLeadImport(rows, lookups({ canAssign: false }));
    expect(barred.rows[0].errors[0]).toMatch(/may not choose owners/);

    const allowed = planLeadImport(rows, lookups({ canAssign: true }));
    expect(allowed.rows[0].input?.ownerId).toBe("u-meera");

    const unknown = planLeadImport(
      sheet(["Name", "Phone", "Lead source", "Owner"], [["Ravi", "9886011223", "Website", "nobody@x.in"]]),
      lookups({ canAssign: true }),
    );
    expect(unknown.rows[0].errors).toEqual(['Owner "nobody@x.in" is not recognised']);
  });

  it("offers a column for every field the New Lead form captures", () => {
    expect(LEAD_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key)).toEqual(["name", "phone", "source"]);
  });
});
