import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SCREENS } from "@/lib/screens/registry";
import { RECORDS } from "@/lib/records/registry";
import { FORMS } from "@/lib/forms/registry";

/**
 * The app's gates against the web's, module by module.
 *
 * Three doors lead to the same data and each decides for itself what it asks
 * for: the web page calls `requirePermission`, the list route calls
 * `exportGate`, and a record or a form carries its own code. A phone that asks
 * for more than the web shows somebody nothing where the desk shows them
 * everything — which is how Available Flats came to be empty for a Project
 * Manager — and a phone that asks for less is worse.
 *
 * So the codes are read out of all three and compared. Nothing here is a
 * judgement about what a role should hold; it is only that the three doors
 * agree.
 */

const ROOT = join(__dirname, "..", "..");
const API = join(ROOT, "src", "app", "api");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const APP_SOURCES = walk(join(ROOT, "src", "app")).map((p) => ({ p, s: readFileSync(p, "utf8") }));

/** The view code a list route asks for, honouring an `{ asList }` override. */
function listGate(module: string): string[] | null {
  const file = join(API, module, "export", "route.ts");
  if (!existsSync(file)) return null;
  const src = readFileSync(file, "utf8");
  const call = src.slice(src.indexOf("exportGate("));
  const codes = [...call.slice(0, call.indexOf(";")).matchAll(/PERM\.([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
  const override = call.slice(0, call.indexOf(";")).includes("asList");
  if (override) {
    // Everything inside the `{ asList: [...] }` is what the list asks for.
    const inside = call.slice(call.indexOf("asList"), call.indexOf("}", call.indexOf("asList")));
    return [...inside.matchAll(/PERM\.([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
  }
  return codes.filter((c) => !c.endsWith(".export"));
}

/** The code a web page guards itself with. */
function pageGuard(...candidates: string[]): string[] | null {
  for (const rel of candidates) {
    const file = join(ROOT, "src", "app", "(app)", rel);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const codes = [...src.matchAll(/requirePermission\(\s*PERM\.([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
    if (codes.length) return codes;
  }
  return null;
}

/** The permission an action authorizes with, read out of its own body. */
function authorizes(actionKey: string): string[] {
  const name = `${actionKey.split("/").pop()!}Action`;
  for (const { s } of APP_SOURCES) {
    const at = s.indexOf(`export async function ${name}(`);
    if (at < 0) continue;
    const rest = s.slice(at + 10);
    const next = rest.indexOf("\nexport ");
    const body = next < 0 ? rest : rest.slice(0, next);
    return [...body.matchAll(/authorize\(\s*(?:PERM\.([A-Za-z0-9_.]+)|[A-Za-z]+\s*\?\s*PERM\.([A-Za-z0-9_.]+)\s*:\s*PERM\.([A-Za-z0-9_.]+))/g)]
      .flatMap((m) => [m[1], m[2], m[3]])
      .filter((c): c is string => Boolean(c));
  }
  return [];
}

describe("a list asks for what its own web page asks for", () => {
  for (const key of Object.keys(SCREENS)) {
    it(key, () => {
      const list = listGate(key);
      expect(list, `no export route for ${key}`).not.toBeNull();
      const web = pageGuard(`${key}/page.tsx`, `${key.replace(/s$/, "")}/page.tsx`);
      // A few screens are a tab of another page and have none of their own.
      if (!web) return;
      expect(
        list!.some((c) => web.includes(c)),
        `the phone's list asks ${list!.join(", ")} and the web page asks ${web.join(", ")}`,
      ).toBe(true);
    });
  }
});

/*
 * Two of these screens open **another module's** record from their rows, where
 * the web's own row opens nothing at all: a reorder line is an item of the
 * stock master, an attendance line is an employee. They ask for that module's
 * permission, which is the data's own, and the integration test
 * `role-coverage` checks that no role is caught between the two.
 */
const RECORD_FROM_ANOTHER_LIST: Record<string, string> = {
  "material/reorder": "A reorder line opens the item of the stock master.",
  "hr/attendance": "An attendance line opens the employee.",
};

describe("a record asks for what its own detail page asks for", () => {
  for (const [key, def] of Object.entries(RECORDS)) {
    const permission = String((def as { permission: string }).permission);
    it(key, () => {
      if (key in RECORD_FROM_ANOTHER_LIST) return;
      const web = pageGuard(`${key}/[id]/page.tsx`, `${key}/page.tsx`, `${key.replace(/s$/, "")}/page.tsx`);
      if (!web) return;
      expect(web, `the record asks ${permission}`).toContain(permission);
    });
  }
});

describe("a form asks for what its action authorizes", () => {
  for (const form of Object.values(FORMS)) {
    if (!form.action) continue;
    it(`${form.key} → ${form.action}`, () => {
      const codes = authorizes(form.action!);
      expect(codes.length, `no authorize() found in ${form.action}`).toBeGreaterThan(0);
      expect(
        codes.includes(String(form.permission)),
        `the form asks ${String(form.permission)} and the action authorizes ${codes.join(" or ")}`,
      ).toBe(true);
    });
  }
});
