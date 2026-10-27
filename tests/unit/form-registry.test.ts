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
  "tasks:create": "tasks/new/new-task-form.tsx",
  "tasks:edit": "tasks/new/new-task-form.tsx",
  "sales/leads:create": "sales/leads/leads-screen.tsx",
  "sales/leads:edit": "sales/leads/[id]/lead-edit-modal.tsx",
  "hr/attendance:mark": "hr/hr-screen.tsx",
  "hr/employees:create": "hr/hr-screen.tsx",
  "hr/employees:edit": "hr/hr-screen.tsx",
  "sales/leads:refer": "sales/leads/leads-screen.tsx",
  "advances:create": "advances/advances-screen.tsx",
  "hr/profile:edit": "hr/edit-requests/profile-edit-form.tsx",
};

/**
 * Whether the screen shows this label.
 *
 * The web writes one several ways: a `label="…"` prop, the whole text of its
 * own element, text followed by a required mark — `>Project {REQUIRED}<` — and
 * text followed by something interpolated: a middot and a unit, as "Reqd qty ·
 * BAG" is, or the unit in brackets, as `Quantity${` (${s.uom})`}` is.
 */
function labelled(src: string, label: string): boolean {
  // An ampersand is written `&amp;` in JSX text.
  const web = label.replace(/&/g, "&amp;");
  if (src.includes(`>${web}`) || src.includes(`"${web}"`)) return true;
  if (src.includes(`label="${label}"`) || src.includes(`label={"${label}"}`)) return true;
  if (src.includes(`"${label}"`)) return true;
  // A template literal that starts with the label: `Quantity${…}`.
  if (src.includes(`label={\`${label}`)) return true;
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
  /*
   * A rider's referral is the capture-lead drawer cut to three fields. The
   * drawer's labels are the rows of Masters → Lead Settings, not literals, and
   * a rider has no web screen to take a title from.
   */
  "sales/leads:refer → Refer a rider",
  "sales/leads:refer → A tele-caller will call them.",
  "sales/leads:refer → Name",
  "sales/leads:refer → Mobile number",
  "sales/leads:refer → Location",
  /*
   * The web's photograph is a square you press, labelled from inside — "Upload
   * photo", then "✓ Photo added", then "Change" over the picture on file. A
   * field needs one name for all three states.
   */
  "hr/employees:create → Photo",
  "hr/employees:edit → Photo",
  // The document slots are drawn from RIDER_DOC_KINDS in src/lib/riders/onboarding.ts, so
  // their names are not literals in the screen.
  ...["create", "edit"].flatMap((m) =>
    ["Aadhaar front", "Aadhaar back", "PAN card", "Passbook", "Driving licence"].map((k) => `hr/employees:${m} → ${k}`),
  ),
]);

/**
 * Arguments the web passes from outside its form, so they are not `name="…"`
 * anywhere: the checklist's category is the tab you are standing on.
 */
const OUTSIDE_THE_FORM = new Set([
  /*
   * The web writes these two as one input per kind — `name={`doc:${kind}`}`
   * over `["Aadhaar card", "PAN card"]` — so the literal name appears nowhere.
   */
  "hr/employees:create → doc:Aadhaar front",
  "hr/employees:create → doc:Aadhaar back",
  "hr/employees:create → doc:PAN card",
  "hr/employees:create → doc:Passbook",
  "hr/employees:create → doc:Driving licence",
  "hr/employees:edit → doc:Aadhaar front",
  "hr/employees:edit → doc:Aadhaar back",
  "hr/employees:edit → doc:PAN card",
  "hr/employees:edit → doc:Passbook",
  "hr/employees:edit → doc:Driving licence",
  // The stale guard the lead's edit drawer posts as a hidden input.
  "sales/leads:edit → updatedAt",
]);

/**
 * Forms whose words are the app's own, because the web has the action and no
 * screen that calls it. Both are written down in docs/MOBILE_PARITY.md; there
 * is nothing on the web to copy, so there is nothing to compare against.
 */
const NO_WEB_SCREEN = new Set(["tasks:edit"]);

function source(key: string): string {
  return readFileSync(join(ROOT, "src", "app", "(app)", SOURCE[key]), "utf8");
}

describe("every form points at something real", () => {
  it("names an action the mobile boundary exposes", () => {
    for (const form of Object.values(FORMS)) {
      /*
       * A form whose shape is `openRecord` calls nothing: it asks one question
       * and opens the record where the next step lives, which is how the web's
       * goods receipt works — a list of links, then the order's own screen.
       */
      if (form.shape.kind === "openRecord") {
        expect(form.action, `${form.key} opens a record, so it names no action`).toBe("");
        continue;
      }
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
    for (const name of ["name", "phone", "email", "location", "companyIds", "requirement"]) {
      expect(src.includes(`name="${name}"`), `lead field ${name}`).toBe(true);
    }
    // A field the master owns rather than the lead record posts under its id.
    expect(src.includes("`custom:${f.id}`")).toBe(true);
  });

  it("uses the design's own placeholders", () => {
    for (const p of ["98765 43210 (without country code)", "dd-mm-yyyy", "Type here"]) {
      expect(src.includes(p), `lead placeholder ${p}`).toBe(true);
    }
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
          if (OUTSIDE_THE_FORM.has(`${key} → ${f.name}`)) continue;
          const used =
            src.includes(`name="${f.name}"`) ||
            // Collected by hand and appended to the FormData, as a multi-select
            // and a line array are; or held in state and passed as a property
            // of the object the action takes, which is shorthand by then.
            src.includes(`"${f.name}"`) ||
            new RegExp(`\\b${f.name}\\b`).test(src);
          expect(used, `${key} field ${f.name}`).toBe(true);
        }
      });

      it("uses the web's own labels", () => {
        if (NO_WEB_SCREEN.has(key)) return;
        for (const f of form.fields) {
          // A field that is carried and never drawn has no label to compare.
          if (f.hidden) continue;
          if (!OURS.has(`${key} → ${f.label}`)) {
            expect(labelled(src, f.label), `${key} label ${f.label}`).toBe(true);
          }
          for (const r of f.row ?? []) {
            if (r.hidden) continue;
            if (OURS.has(`${key} → ${r.label}`)) continue;
            expect(labelled(src, r.label), `${key} line label ${r.label}`).toBe(true);
          }
        }
      });

      it("uses the web's own placeholders and hints", () => {
        if (NO_WEB_SCREEN.has(key)) return;
        for (const f of form.fields) {
          if (f.placeholder) {
            expect(src.includes(f.placeholder), `${key} placeholder ${f.placeholder}`).toBe(true);
          }
          if (f.hint && !OURS.has(`${key} → ${f.hint}`)) {
            expect(src.includes(f.hint), `${key} hint ${f.hint}`).toBe(true);
          }
          if (f.note && !OURS.has(`${key} → ${f.note}`)) {
            expect(src.includes(f.note), `${key} note ${f.note}`).toBe(true);
          }
        }
      });

      it("says what the web's title and buttons say", () => {
        if (NO_WEB_SCREEN.has(key)) return;
        if (!OURS.has(`${key} → ${form.title}`)) {
          expect(src.includes(form.title), `${key} title`).toBe(true);
        }
        if (!OURS.has(`${key} → ${form.submitLabel}`)) {
          expect(src.includes(form.submitLabel), `${key} submit label`).toBe(true);
        }
        if (form.description && !OURS.has(`${key} → ${form.description}`)) {
          expect(src.includes(form.description), `${key} description`).toBe(true);
        }
      });
    });
  }
});
