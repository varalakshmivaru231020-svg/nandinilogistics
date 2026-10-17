import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FORMS } from "@/lib/forms/registry";

/**
 * The check `form-registry.test.ts` says it cannot make: **a field the web has
 * and the form does not.**
 *
 * That test reads labels and names the registry already carries, so it catches
 * a word that drifted; it cannot count what is missing. This one reads every
 * name the web's screen submits — `name="x"`, `fd.set("x")`, `fd.append("x")`
 * — and insists the form asks for it too.
 *
 * It found two: the site log's latitude and longitude, which the browser fills
 * from its own geolocation and the phone sent as nothing, and the employee
 * form's country code.
 *
 * A name the web submits and the form deliberately does not carry is listed
 * below **with the reason**, which is the only way this stays honest.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(`${ROOT}/src/app/(app)/${p}`, "utf-8");

/** Which screen each form was copied from — the same map the other test uses. */
const SOURCE: Record<string, string> = {
  "calendar:create": "calendar/calendar-screen.tsx",
  "calendar:edit": "calendar/calendar-screen.tsx",
  "tasks:create": "tasks/new/new-task-form.tsx",
  "tasks:edit": "tasks/new/new-task-form.tsx",
  "sales/customers:create": "sales/customers/customers-screen.tsx",
  "material/indents:create": "material/indents/new/indent-form.tsx",
  "material/indents:edit": "material/indents/new/indent-form.tsx",
  "material/vendors:create": "material/vendors/vendor-form.tsx",
  "material/vendors:edit": "material/vendors/vendor-form.tsx",
  "material/stock:create": "material/stock/item-form.tsx",
  "projects/progress:create": "projects/progress/progress-screen.tsx",
  "projects/projects:create": "projects/new-project-button.tsx",
  "projects/projects:edit": "projects/[id]/edit-project-button.tsx",
  "units/price-lists:create": "units/price-lists/price-lists-screen.tsx",
  "kb:create": "kb/kb-screen.tsx",
  "kb:edit": "kb/kb-screen.tsx",
  "material/transfers:create": "material/transfers/transfers-screen.tsx",
  "hr/employees:edit": "hr/hr-screen.tsx",
  "units:create": "units/unit-manager.tsx",
  "units:edit": "units/unit-manager.tsx",
};

/**
 * A name the web submits that the form does not — each with why.
 *
 * Anything added here is a decision, not an oversight. Two of these turned out
 * to be neither:
 *
 *   - `units:edit → updatedAt` claimed the stamp went "as the action's own
 *     argument rather than as a field". It went nowhere, and
 *     `updateUnitAction` reads it out of the body — so every unit edit from a
 *     phone came back "Reload the unit before editing it." A reason that is
 *     merely plausible hides the bug it describes;
 *     `tests/unit/form-coverage.test.ts` now reads the **action** instead, and
 *     could not have been told that story.
 *   - `hr/employees:edit → photo` was true while the boundary carried no file.
 */
const NOT_ASKED = new Map<string, string>([
  ["units:create → updatedAt", "the stale guard the web posts as a hidden input; a create has nothing to guard"],
  ["units:edit → projectId", "a flat cannot move to another project — the web's edit leaves both out"],
  ["units:edit → blockId", "as above: a flat cannot move to another block"],
  ["kb:create → category", "the web's editor posts the category it is standing in; the phone asks for it as `categoryName`"],
  ["kb:edit → category", "as above"],
  ["tasks:edit → checklistIds", "a checklist and its levels are set when a task is raised; the web's edit screen is the same component but does not change them"],
  ["tasks:edit → reviewerIds", "as above"],
  ["tasks:edit → approverIds", "as above"],
]);

/** Names in a screen's source that are never form fields. */
const NOT_A_FIELD = new Set([
  "q", "search", "verdict", "remark", "text", "note",
  // The site log's position arrives as one `geo` field and is sent as these
  // two, which is how the web posts it as well.
  "latitude", "longitude",
]);

describe("every field the web submits, the form asks for", () => {
  for (const [key, path] of Object.entries(SOURCE)) {
    it(key, () => {
      const form = FORMS[key];
      expect(form, `${key} is not in the registry`).toBeTruthy();
      const web = read(path);

      const submitted = new Set<string>([
        ...[...web.matchAll(/name="([a-zA-Z][\w]*)"/g)].map((m) => m[1]),
        ...[...web.matchAll(/fd\.(?:set|append)\("([a-zA-Z][\w]*)"/g)].map((m) => m[1]),
      ]);

      const asked = new Set<string>([
        ...form.fields.map((f) => f.name),
        ...form.fields.flatMap((f) => (f.row ?? []).map((r) => r.name)),
      ]);

      const missing = [...submitted]
        .filter((n) => !NOT_A_FIELD.has(n) && !asked.has(n) && !NOT_ASKED.has(`${key} → ${n}`))
        .sort();

      expect(
        missing,
        `${key} does not ask for what the web submits: ${missing.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("every reason is still needed", () => {
    const stale: string[] = [];
    for (const entry of NOT_ASKED.keys()) {
      const [key, name] = entry.split(" → ");
      const form = FORMS[key];
      if (!form) { stale.push(`${entry}: no such form`); continue; }
      const asked = new Set([
        ...form.fields.map((f) => f.name),
        ...form.fields.flatMap((f) => (f.row ?? []).map((r) => r.name)),
      ]);
      if (asked.has(name)) stale.push(`${entry}: the form asks for it now`);
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });
});
