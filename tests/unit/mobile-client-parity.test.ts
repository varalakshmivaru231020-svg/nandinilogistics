import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";

/**
 * The Android client and the boundary, held together.
 *
 * `mobile/lib/modules.dart` names a list key per module. A key that the server
 * does not serve is a tile that answers 404 when tapped; a list the server
 * serves that the app never names is a module nobody can reach from a phone.
 * Neither is visible from either side on its own, and neither fails anything —
 * so it fails here.
 *
 * This reads the Dart as text rather than running it, which is enough: the
 * question is only whether the two sets of strings agree.
 */

const ROOT = join(__dirname, "..", "..");
const modules = readFileSync(join(ROOT, "mobile", "lib", "modules.dart"), "utf8");

const appListKeys = [...modules.matchAll(/list: '([^']+)'/g)].map((m) => m[1]).sort();

describe("the app and the boundary agree about the lists", () => {
  it("names no list the server does not serve", () => {
    const unknown = appListKeys.filter((k) => !MOBILE_LIST_KEYS.includes(k));
    expect(unknown, "these tiles would 404 — check mobile/lib/modules.dart").toEqual([]);
  });

  /*
   * The other direction, which is the one that quietly loses a module: adding
   * an export route to the web gives the phone a list for free, and nobody
   * thinks to put it in the drawer.
   */
  it("reaches every list the server serves", () => {
    const unreached = MOBILE_LIST_KEYS.filter((k) => !appListKeys.includes(k));
    expect(unreached, "add these to mobile/lib/modules.dart").toEqual([]);
  });

  it("found both sets, so an empty scan cannot pass", () => {
    expect(appListKeys.length).toBeGreaterThan(20);
    expect(MOBILE_LIST_KEYS.length).toBe(appListKeys.length);
  });
});

/**
 * Every module in the web's navigation is now reachable from the phone, and
 * this is what keeps it that way.
 *
 * It used to list six exceptions — Approvals, Tasks, Task Reports, Checklists,
 * Follow-ups and Knowledge Base — each absent because the web had no export
 * route for it to answer from. They have one now, so the list is empty, and a
 * new module added to the web's navigation without a way to reach it from a
 * phone fails here rather than going unnoticed.
 */
describe("every module in the web's navigation is reachable", () => {
  const awaitingAnEndpoint: string[] = [];

  /**
   * A nav href and its list key are not always the same string: the web's
   * Workforce entry is one screen with three tabs, and its list is the employee
   * export. These are the ones that differ.
   */
  const KEY_FOR: Record<string, string> = {
    "/hr": "hr/employees",
    "/projects": "projects/projects",
    "/schedule": "schedule/activities",
    "/units/board": "units",
  };

  it("is still exactly this list — no more, and no fewer", async () => {
    const { NAVIGATION } = await import("@/lib/navigation");
    const webHrefs = NAVIGATION.flatMap((s) => s.items.map((i) => i.href));

    // Masters & Users is web-only by design (brief §12), not awaiting anything.
    const reachable = new Set(appListKeys);
    const unreached = webHrefs.filter((href) => {
      if (href.startsWith("/masters") || href.startsWith("/admin")) return false;
      if (href === "/calendar" || href === "/dashboard" || href === "/dashboard/performance") {
        return false;
      }
      const key = KEY_FOR[href] ?? href.replace(/^\//, "");
      return !reachable.has(key);
    });

    expect(unreached.sort()).toEqual(
      awaitingAnEndpoint.filter((h) => webHrefs.includes(h)).sort(),
    );
  });
});
