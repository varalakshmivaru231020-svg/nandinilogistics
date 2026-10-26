import { existsSync, readFileSync } from "node:fs";
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
 * A name the web submits and the form deliberately does not carry is listed
 * below **with the reason**, which is the only way this stays honest.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(`${ROOT}/src/app/(app)/${p}`, "utf-8");

/** Which screen each form was copied from. */
const SOURCE: Record<string, string> = {
  "sales/leads:edit": "sales/leads/[id]/lead-edit-modal.tsx",
  "hr/employees:create": "hr/hr-screen.tsx",
  "hr/employees:edit": "hr/hr-screen.tsx",
  "tasks:create": "tasks/new/new-task-form.tsx",
  "tasks:edit": "tasks/new/new-task-form.tsx",
};

/**
 * A name the web submits that the form does not — each with why.
 * Anything added here is a decision, not an oversight.
 */
const NOT_ASKED = new Map<string, string>([
  ["tasks:edit → files", "attachments are added when a task is raised or in a remark; the edit changes the task's own fields"],
]);

/** Names in a screen's source that are never form fields. */
const NOT_A_FIELD = new Set(["q", "search", "remark", "text", "note"]);

describe("every field the web submits, the form asks for", () => {
  for (const [key, path] of Object.entries(SOURCE)) {
    it(key, () => {
      const form = FORMS[key];
      expect(form, `${key} is not in the registry`).toBeTruthy();
      // A screen another module is still rebuilding is not this test's to judge.
      if (!existsSync(`${ROOT}/src/app/(app)/${path}`)) return;
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
