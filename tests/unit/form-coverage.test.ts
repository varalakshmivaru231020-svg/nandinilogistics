import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FORMS } from "@/lib/forms/registry";
import type { FormFieldDef } from "@/lib/forms/types";

/**
 * Every field an action reads, against every field the app's form sends.
 *
 * `form-registry.test.ts` checks the other direction — that everything the
 * registry claims exists in the web's modal — and says plainly what it cannot
 * check: a field the web has and the registry does not. This is that check,
 * made against the **action** rather than the JSX, because the action is the
 * one that has to be satisfied: it reads names out of a `FormData`, and a name
 * nobody sends is either a silently missing value or a refusal.
 *
 * It found two that were already shipping:
 *
 *   - `units:edit` never sent `updatedAt`, which `updateUnitAction` insists on
 *     — so **every** unit edit from a phone came back "Reload the unit before
 *     editing it."
 *   - the employee form never sent `photo` or the identity copies, so a new
 *     employee could not be added from the app at all.
 */

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const SOURCES = [
  ...walk(join(ROOT, "src", "app")),
  ...walk(join(ROOT, "src", "lib")),
].map((p) => readFileSync(p, "utf8"));

/** One action's own body, to the end of the function and no further. */
function bodyOf(actionKey: string): string | null {
  const name = `${actionKey.split("/").pop()!}Action`;
  for (const src of SOURCES) {
    const at = src.indexOf(`export async function ${name}(`);
    if (at < 0) continue;
    const rest = src.slice(at + 10);
    const next = rest.indexOf("\nexport ");
    return next < 0 ? rest : rest.slice(0, next);
  }
  return null;
}

/** The keys a zod object declares, where the action hands it the whole form. */
function schemaKeys(name: string): string[] {
  for (const src of SOURCES) {
    const at = src.indexOf(`const ${name} = z.object({`);
    if (at < 0) continue;
    const block = src.slice(at, src.indexOf("});", at));
    return [...block.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]);
  }
  return [];
}

/** Every name the app sends for a form, including rows, geo and the prefixes. */
function sends(fields: ReadonlyArray<FormFieldDef>): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.kind === "geo") {
      // One field on screen, the two names the action reads.
      out.push("latitude", "longitude");
      continue;
    }
    out.push(f.name);
    if (f.prefixes) out.push(f.prefixes);
    if (f.row) out.push(...sends(f.row));
  }
  return out;
}

/**
 * A name the action reads that its form is right not to send, with the reason.
 * Kept short on purpose: anything else is a gap, not a convention.
 */
const NOT_SENT: Record<string, Record<string, string>> = {
  /*
   * The project schema takes six particulars neither of the web's own dialogs
   * asks for. They are left as they stand — the test below reads the web's
   * forms back and fails if either of them grows one of these fields, so the
   * excuse cannot outlive the reason for it.
   */
  "projects/projects:create": {
    companyId: "Not on the web's New project dialog either.",
    cityId: "Not on the web's New project dialog either — it is on the edit.",
    budgetAmount: "Not on the web's New project dialog either.",
    projectManagerId: "Not on the web's New project dialog either.",
    description: "Not on the web's New project dialog either.",
    status: "A new project takes the schema's own default.",
  },
  "projects/projects:edit": {
    companyId: "Not on the web's Edit project dialog either.",
    budgetAmount: "Not on the web's Edit project dialog either.",
    projectManagerId: "Not on the web's Edit project dialog either.",
    description: "Not on the web's Edit project dialog either.",
  },
  "projects/projects:uploadDocument": {
    supersedesId:
      "A new version of a document is started from that document on the web; the app uploads a new one.",
  },
  "sales/leads:create": {
    // Built from Masters → Lead Settings by `lead-form.ts`, which is the same
    // configuration the web's own form is drawn from.
    phoneCode: "The configured form supplies it.",
    phone: "The configured form supplies it.",
    unitTypeId: "The configured form supplies it.",
    "custom:${field.id}": "A configured field, by its own id.",
  },
};

describe("every field an action reads is a field the app sends", () => {
  const gaps: string[] = [];

  for (const form of Object.values(FORMS)) {
    if (!form.action) continue; // opens a record; calls nothing
    it(`${form.key} → ${form.action}`, () => {
      const body = bodyOf(form.action!);
      expect(body, `no action body found for ${form.action}`).not.toBeNull();

      const reads = new Set<string>([
        ...[...body!.matchAll(/formData\.get\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]),
        ...[...body!.matchAll(/formData\.getAll\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]),
      ]);
      for (const m of body!.matchAll(/([A-Z][A-Za-z]*Schema)\.safeParse\(Object\.fromEntries\(formData\)\)/g)) {
        for (const key of schemaKeys(m[1])) reads.add(key);
      }

      const sent = new Set(sends(form.fields));
      const excused = NOT_SENT[form.key] ?? {};
      const missing = [...reads].filter((name) => !sent.has(name) && !(name in excused));
      if (missing.length) gaps.push(`${form.key}: ${missing.join(", ")}`);
      expect(missing, `${form.key} never sends: ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("found nothing", () => {
    expect(gaps).toEqual([]);
  });
});

/*
 * The excuse above, checked rather than taken on trust. If the web ever asks
 * for a project's company, budget, manager or description, the phone has to
 * ask for it too — and this fails until it does.
 */
describe("what the web's project dialogs do not ask for either", () => {
  const dialogs = {
    "projects/projects:create": "src/app/(app)/projects/new-project-button.tsx",
    "projects/projects:edit": "src/app/(app)/projects/[id]/edit-project-button.tsx",
  } as const;

  for (const [key, file] of Object.entries(dialogs)) {
    it(file, () => {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const name of Object.keys(NOT_SENT[key])) {
        expect(
          src.includes(`name="${name}"`) || src.includes(`name: "${name}"`),
          `the web now asks for ${name} — the app's ${key} must too`,
        ).toBe(false);
      }
    });
  }
});
