import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FORMS } from "@/lib/forms/registry";
import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";
import { PERMISSIONS } from "@/lib/permissions/registry";

/**
 * The form registry, against the forms themselves.
 *
 * These are what the Android client draws a create screen from, and they were
 * copied field by field out of the web's modals. The thing that can drift is
 * the prose and the field names: a label the web changed, a `name` the action
 * reads that nobody renamed here, a placeholder that moved. So each form's
 * fields are read back out of the screen that renders them and compared.
 *
 * What this cannot check is a field the web has and the registry does not —
 * `every field the modal has` is not something a regex can count honestly
 * across a JSX form with conditional sections. So the names are checked in the
 * direction that matters for correctness: everything the registry claims must
 * exist in the web's form, under the same label.
 */

const ROOT = join(__dirname, "..", "..");

/** The screen that renders each form. */
const SOURCE: Record<string, string> = {
  "calendar:create": "calendar/calendar-screen.tsx",
  "tasks:create": "tasks/new/new-task-form.tsx",
  "sales/customers:create": "sales/customers/customers-screen.tsx",
  "sales/leads:create": "sales/leads/leads-screen.tsx",
  "material/indents:create": "material/indents/new/indent-form.tsx",
  "material/vendors:create": "material/vendors/vendor-form.tsx",
  "hr/attendance:mark": "hr/hr-screen.tsx",
  "projects/progress:create": "projects/progress/progress-screen.tsx",
  "units/price-lists:create": "units/price-lists/price-lists-screen.tsx",
  "kb:create": "kb/kb-screen.tsx",
};

/**
 * Whether the screen shows this label.
 *
 * The web writes one several ways: a `label="…"` prop, the whole text of its
 * own element, text followed by a required mark — `>Project {REQUIRED}<` — and
 * text followed by a middot and something interpolated, as "Reqd qty · BAG"
 * and "On whom · they accept before it is theirs" are. All of them are the
 * same label.
 */
function labelled(src: string, label: string): boolean {
  if (src.includes(`label="${label}"`) || src.includes(`label={"${label}"}`)) return true;
  if (src.includes(`"${label}"`)) return true;
  // `>Label<`, `>Label {REQUIRED}<`, `>Label <span…`, and the same after a
  // newline and indentation.
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`>\\s*${esc}\\s*(<|\\{|·)`).test(src);
}

/**
 * The labels the phone has to invent, with the reason.
 *
 * The web shows an indent's item as a heading over its quantity box — it was
 * chosen in a search pane, so it is not a labelled field there. A phone's line
 * carries its own picker and the picker needs a name. Nothing else belongs in
 * here: a label the web writes is the label the phone writes.
 */
const OURS = new Set([
  "material/indents:create → Item",
  // The vendor form's category picker is a list of chips with an "add a new
  // category" box rather than a labelled field.
  "material/vendors:create → Supply categories",
]);

function source(key: string): string {
  return readFileSync(join(ROOT, "src", "app", "(app)", SOURCE[key]), "utf8");
}

describe("every form points at something real", () => {
  it("names an action the mobile boundary exposes", () => {
    for (const form of Object.values(FORMS)) {
      expect(MOBILE_ACTIONS[form.action], `${form.key} → ${form.action}`).toBeDefined();
    }
  });

  it("names a registered permission", () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code));
    for (const form of Object.values(FORMS)) {
      expect(codes.has(form.permission), `${form.key} → ${form.permission}`).toBe(true);
    }
  });

  /** The key is the module and the name, and the module is what it says. */
  it("is keyed by its own module", () => {
    for (const [key, form] of Object.entries(FORMS)) {
      expect(form.key).toBe(key);
      expect(key.startsWith(`${form.module}:`)).toBe(true);
    }
  });

  it("asks for a remark where the field is required but never silently", () => {
    for (const form of Object.values(FORMS)) {
      for (const f of form.fields) {
        // A field the client must render needs a kind it knows.
        expect(f.name.length, `${form.key}.${f.name}`).toBeGreaterThan(0);
        if (f.kind === "rows") {
          expect(f.row?.length, `${form.key}.${f.name} has line fields`).toBeGreaterThan(0);
        }
        if (f.kind === "select" || f.kind === "lookup" || f.kind === "multi") {
          expect(
            Boolean(f.options) || Boolean(f.source),
            `${form.key}.${f.name} has options or a source`,
          ).toBe(true);
        }
      }
    }
  });
});

/**
 * The capture-lead form is the one that cannot be written down: the web drawer
 * reads Masters → Lead Settings, so the registry reads the same rows. What can
 * still drift is the mapping — the name each system field posts under and the
 * placeholder each kind carries — so that is read back out of the drawer.
 */
describe("the lead form's mapping, against the drawer that does the same", () => {
  const src = source("sales/leads:create");

  it("posts under the names the drawer posts under", () => {
    for (const name of [
      "name", "phone", "email", "sourceId", "projectId", "unitTypeId",
      "budgetMax", "requirement", "siteVisitPlanned",
    ]) {
      expect(src.includes(`name="${name}"`), `lead field ${name}`).toBe(true);
    }
    // A field the master owns rather than the lead record posts under its id.
    expect(src.includes("`custom:${f.id}`")).toBe(true);
  });

  it("uses the design's own placeholders", () => {
    for (const p of ["98765 43210 (without country code)", "e.g. 85,00,000", "dd-mm-yyyy", "Type here"]) {
      expect(src.includes(p), `lead placeholder ${p}`).toBe(true);
    }
  });

  it("calls the nothing-chosen option what the drawer calls it", () => {
    expect(src.includes("Select…")).toBe(true);
  });
});

/**
 * The attendance sheet is the other form that cannot be written down: its
 * lines are the workforce. What can drift is the three marks and the names the
 * action reads, so those are checked against the tab that does the same.
 */
describe("the attendance sheet's mapping, against the tab that does the same", () => {
  const src = source("hr/attendance:mark");

  it("offers the web's own three marks, in its words", () => {
    for (const [key, label] of [
      ["PRESENT", "Present"],
      ["ABSENT", "Absent"],
      ["HALF_DAY", "Half day"],
    ]) {
      expect(src.includes(`"${key}"`), `mark ${key}`).toBe(true);
      expect(src.includes(`"${label}"`), `mark label ${label}`).toBe(true);
    }
  });

  it("sends what the action reads", () => {
    for (const name of ["employeeId", "status", "overtimeHours"]) {
      expect(src.includes(name), `attendance field ${name}`).toBe(true);
    }
  });
});

describe("the fields are the web's fields", () => {
  it("every form's screen is named", () => {
    for (const key of Object.keys(FORMS)) {
      expect(SOURCE[key], `${key} names the screen it was copied from`).toBeDefined();
    }
  });

  for (const [key, form] of Object.entries(FORMS)) {
    describe(key, () => {
      const src = source(key);

      it("reads the same field names the web submits", () => {
        for (const f of form.fields) {
          const used =
            src.includes(`name="${f.name}"`) ||
            // Collected by hand and appended to the FormData, as a multi-select
            // and a line array are.
            src.includes(`"${f.name}"`) ||
            src.includes(`${f.name}:`);
          expect(used, `${key} field ${f.name}`).toBe(true);
        }
      });

      it("uses the web's own labels", () => {
        for (const f of form.fields) {
          if (!OURS.has(`${key} → ${f.label}`)) {
            expect(labelled(src, f.label), `${key} label ${f.label}`).toBe(true);
          }
          for (const r of f.row ?? []) {
            if (OURS.has(`${key} → ${r.label}`)) continue;
            expect(labelled(src, r.label), `${key} line label ${r.label}`).toBe(true);
          }
        }
      });

      it("uses the web's own placeholders and hints", () => {
        for (const f of form.fields) {
          if (f.placeholder) {
            expect(src.includes(f.placeholder), `${key} placeholder ${f.placeholder}`).toBe(true);
          }
          if (f.hint) {
            expect(src.includes(f.hint), `${key} hint ${f.hint}`).toBe(true);
          }
          if (f.note) {
            expect(src.includes(f.note), `${key} note ${f.note}`).toBe(true);
          }
        }
      });

      it("says what the web's title and buttons say", () => {
        expect(src.includes(form.title), `${key} title`).toBe(true);
        expect(src.includes(form.submitLabel), `${key} submit label`).toBe(true);
        if (form.description) {
          expect(src.includes(form.description), `${key} description`).toBe(true);
        }
      });
    });
  }
});
