import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";

/**
 * The Android client's module registry, against the boundary.
 *
 * `mobile/lib/core/modules.dart` names a key per module. For most of them the
 * key is also the boundary's list key, so a typo there is a tile that answers
 * 404 when tapped — invisible from either side alone, and failing nothing.
 *
 * It also pins which modules the app claims to have **finished**. The first
 * version of this app listed thirty modules and had built almost none of them,
 * which is why it was rejected; the registry now carries a `built` flag and the
 * drawer draws only those. This test is what keeps that flag honest.
 *
 * The Dart is read as text rather than run: the question is only whether two
 * sets of strings agree.
 */

const ROOT = join(__dirname, "..", "..");
const source = readFileSync(join(ROOT, "mobile", "lib", "core", "modules.dart"), "utf8");

interface Entry {
  key: string;
  built: boolean;
}

const entries: Entry[] = [...source.matchAll(/Mod\(\s*key:\s*'([^']+)'([\s\S]*?)\),\n/g)].map(
  (m) => ({ key: m[1], built: /built:\s*true/.test(m[2]) }),
);

/** Screens that are not a list: they have an endpoint of their own, or none. */
const NOT_A_LIST = new Set(["dashboard", "approvals", "calendar", "checklists"]);

describe("the app's module registry", () => {
  it("was read at all", () => {
    expect(entries.length).toBeGreaterThan(15);
    expect(entries.some((e) => e.built)).toBe(true);
  });

  /*
   * The one that catches a typo. Every module keyed to a list must name a list
   * the server actually serves.
   */
  it("names no list the boundary does not serve", () => {
    const unknown = entries
      .filter((e) => !NOT_A_LIST.has(e.key))
      .filter((e) => !MOBILE_LIST_KEYS.includes(e.key))
      .map((e) => e.key);
    expect(unknown, "these would 404 — check mobile/lib/core/modules.dart").toEqual([]);
  });

  /*
   * A module cannot be finished if there is nothing for it to read. This would
   * have caught the whole first attempt in one line, had the flag existed.
   */
  it("claims nothing finished that it cannot read", () => {
    const impossible = entries
      .filter((e) => e.built && !NOT_A_LIST.has(e.key))
      .filter((e) => !MOBILE_LIST_KEYS.includes(e.key))
      .map((e) => e.key);
    expect(impossible).toEqual([]);
  });

  /*
   * And the shape of the work left. Stated rather than discovered: the drawer
   * shows the built ones and sums up the rest, so this number is the one the
   * app tells its own user.
   */
  it("reports how much is still to build", () => {
    const built = entries.filter((e) => e.built).map((e) => e.key);
    const pending = entries.filter((e) => !e.built).map((e) => e.key);

    // Built so far. Raise this deliberately, as each module is finished.
    expect(built.sort()).toEqual(["approvals", "dashboard", "material/indents"]);
    expect(pending.length).toBeGreaterThan(0);

    // Every pending one has somewhere to read from when its turn comes, except
    // the ones that need an endpoint of their own.
    const orphan = pending
      .filter((k) => !NOT_A_LIST.has(k))
      .filter((k) => !MOBILE_LIST_KEYS.includes(k));
    expect(orphan, "these have no endpoint to build against").toEqual([]);
  });
});
