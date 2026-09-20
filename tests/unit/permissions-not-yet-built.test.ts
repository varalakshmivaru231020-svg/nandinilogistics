import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LIVE_PERMISSIONS, NOT_YET_BUILT, PERMISSIONS } from "@/lib/permissions/registry";
import { MASTERS } from "@/lib/masters/registry";

const ROOT = join(__dirname, "..", "..");

/**
 * NOT_YET_BUILT names the permissions nothing in the app asks for. It is only
 * worth keeping if it stays true, so it is computed here the same way it was
 * compiled — every `PERM.x.y.z` written in the source, plus the two families
 * resolved at runtime — and compared.
 *
 * A code that starts guarding something, or stops existing, fails here rather
 * than quietly going stale.
 */
function codesReferencedInSource(): Set<string> {
  const literal = execSync("grep -rho 'PERM\\.[a-zA-Z0-9_.]*' src || true", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((s) => s.replace(/^PERM\./, ""));

  const used = new Set(literal);

  // masterPerm(def, action) — every master, every action.
  for (const m of MASTERS) {
    for (const a of ["view", "create", "update", "delete", "toggleStatus", "import", "export"]) {
      used.add(`masters.${m.resource}.${a}`);
    }
  }
  // reports.<key>.view / .export, keyed off the report catalogue.
  const reports = readFileSync(join(ROOT, "src/lib/reports/index.ts"), "utf8");
  for (const m of reports.matchAll(/key:\s*"([a-zA-Z0-9]+)"/g)) {
    used.add(`reports.${m[1]}.view`);
    used.add(`reports.${m[1]}.export`);
  }
  return used;
}

describe("permissions that guard nothing are declared, not hidden", () => {
  const referenced = codesReferencedInSource();
  const unreferenced = PERMISSIONS.map((p) => p.code).filter((c) => !referenced.has(c)).sort();

  it("every code in NOT_YET_BUILT still exists in the registry", () => {
    const all = new Set(PERMISSIONS.map((p) => p.code));
    const gone = [...NOT_YET_BUILT].filter((c) => !all.has(c));
    expect(gone, `NOT_YET_BUILT names codes the registry no longer has: ${gone.join(", ")}`).toEqual([]);
  });

  it("every code in NOT_YET_BUILT still guards nothing", () => {
    const nowUsed = [...NOT_YET_BUILT].filter((c) => referenced.has(c));
    expect(
      nowUsed,
      `these are guarding something now — take them out of NOT_YET_BUILT so the matrix offers them: ${nowUsed.join(", ")}`,
    ).toEqual([]);
  });

  it("nothing guards nothing without saying so", () => {
    const undeclared = unreferenced.filter((c) => !NOT_YET_BUILT.has(c));
    expect(
      undeclared,
      `these guard nothing and are not declared. Either use them, or add them to NOT_YET_BUILT: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("the matrix offers exactly the permissions that guard something", () => {
    expect(LIVE_PERMISSIONS).toHaveLength(PERMISSIONS.length - NOT_YET_BUILT.size);
    expect(LIVE_PERMISSIONS.some((p) => p.notYetBuilt)).toBe(false);
  });

  it("keeps the unbuilt ones registered, so roles holding them are undisturbed", () => {
    // They are hidden from the matrix, never removed from the catalogue.
    for (const code of NOT_YET_BUILT) {
      expect(PERMISSIONS.some((p) => p.code === code)).toBe(true);
    }
  });
});
