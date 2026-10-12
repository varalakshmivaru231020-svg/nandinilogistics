import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Android brief has to keep up with the web app.
 *
 * `docs/ANDROID_APP_PROMPT.md` is a contract: it is handed to whoever builds
 * the client, and parity with the web is the whole requirement. A screen or an
 * action added here and not named there does not get built — and nobody finds
 * out from the document, because a document cannot fail.
 *
 * So it fails here instead. Adding a screen or a server action means naming it
 * in the brief in the same change, exactly as adding a guarded feature means
 * registering its permission in the same change.
 *
 * The one exception is the **Masters & Users** module, which is deliberately
 * web-only (brief §12): master data, reference data, users, roles, sessions,
 * audit and settings. Its screens live under `/masters` and `/admin`, and its
 * actions with them.
 */

const ROOT = join(__dirname, "..", "..");
const APP_DIR = join(ROOT, "src", "app", "(app)");
const BRIEF = readFileSync(join(ROOT, "docs", "ANDROID_APP_PROMPT.md"), "utf8");

const webOnly = (path: string) => path.startsWith("/masters") || path.startsWith("/admin");

function walk(dir: string, prefix = ""): Array<{ route: string; dir: string }> {
  const found: Array<{ route: string; dir: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const segment = entry.startsWith("(") ? "" : `/${entry}`;
    const route = prefix + segment;
    if (readdirSync(full).includes("page.tsx")) found.push({ route: route || "/", dir: full });
    found.push(...walk(full, route));
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const screens = walk(APP_DIR);

describe("every screen the app is meant to have is in the brief", () => {
  /*
   * Detail, new and edit screens are covered by their list route plus the
   * patterns in §6.1 and §6.4, so only the base routes have to be named — a
   * brief that said `/material/grn/[id]/edit` would be listing file paths, not
   * describing a product.
   */
  const base = [...new Set(screens
    .map((s) => s.route)
    .filter((r) => !webOnly(r))
    .filter((r) => !/\/\[[^\]]+\]|\/new$|\/edit$/.test(r)))].sort();

  it("names all of them", () => {
    const missing = base.filter((r) => !BRIEF.includes(r));
    expect(missing, "add these to §7, or to §12 if they are deliberately out of scope").toEqual([]);
  });

  it("found the whole route table, so an empty walk cannot pass", () => {
    expect(base.length).toBeGreaterThan(30);
  });
});

describe("every server action the app may call is in the brief", () => {
  /*
   * Named without the `Action` suffix, which is how §8 writes them: the brief
   * describes `acceptTask`, the code exports `acceptTaskAction`.
   */
  const found = new Map<string, string>();
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const rel = file.slice(ROOT.length);
    for (const [, name] of readFileSync(file, "utf8")
      .matchAll(/export async function ([a-zA-Z0-9_]+)Action\b/g)) {
      if (!found.has(name)) found.set(name, rel);
    }
  }

  // `runAction` is the wrapper every action goes through, not an action.
  found.delete("run");

  const inScope = [...found.entries()]
    .filter(([, file]) => !file.includes("/masters/") && !file.includes("/admin/"))
    .map(([name]) => name)
    .sort();

  it("names all of them", () => {
    const missing = inScope.filter((name) => !new RegExp("`" + name + "`").test(BRIEF));
    expect(missing, "add these to §8 with the permission they authorize").toEqual([]);
  });

  it("found the actions, so an empty scan cannot pass", () => {
    expect(inScope.length).toBeGreaterThan(140);
  });
});

describe("the brief's own counts", () => {
  /*
   * The header states the size of the system. It has been wrong twice — once
   * claiming 550 permission codes against a header claiming 561, and once
   * claiming 177 actions. A number nobody checks is a number that rots.
   */
  it("states the permission code count the registry actually has", async () => {
    const { PERMISSIONS } = await import("@/lib/permissions/registry");
    expect(BRIEF).toContain(`${PERMISSIONS.length} permission`);
  });

  /*
   * Counted by name, which is how §8 lists them. Names and definitions are not
   * the same number: `requestExtension` exists twice — once for a task's
   * deadline, once for a schedule activity's — and §8 lists it under both, with
   * a different permission each time.
   */
  it("states the in-scope action count", () => {
    const names = new Set<string>();
    for (const file of sourceFiles(join(ROOT, "src"))) {
      if (file.includes("/masters/") || file.includes("/admin/")) continue;
      for (const [, name] of readFileSync(file, "utf8")
        .matchAll(/export async function ([a-zA-Z0-9_]+)Action\b/g)) {
        if (name !== "run") names.add(name);
      }
    }
    expect(BRIEF).toContain(`${names.size} actions in scope`);
  });
});
