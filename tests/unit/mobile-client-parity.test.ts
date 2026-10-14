import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";
import { NAVIGATION } from "@/lib/navigation";
import { SCREENS } from "@/lib/screens/registry";

/**
 * The Android client against the web's own sidebar.
 *
 * The app used to keep its own list of modules, and it drifted: a dozen screens
 * the web reaches from inside other screens had been promoted to top level, so
 * the drawer no longer looked like the panel. The menu now comes from
 * `/api/mobile/v1/screens`, which serves `NAVIGATION` itself — so the only
 * thing the app still says about a route is **which list it reads**, in
 * `hrefToModule`.
 *
 * This checks that map against the navigation: every entry a person can be
 * shown leads somewhere, and nothing claims a list the server does not serve.
 */

const ROOT = join(__dirname, "..", "..");
const nav = readFileSync(join(ROOT, "mobile", "lib", "core", "nav.dart"), "utf8");

/** `hrefToModule` in nav.dart, as the app has it. */
function hrefToModule(): Map<string, string> {
  const block = nav.slice(
    nav.indexOf("const hrefToModule"),
    nav.indexOf("};", nav.indexOf("const hrefToModule")),
  );
  const out = new Map<string, string>();
  for (const m of block.matchAll(/'([^']+)':\s*'([^']+)'/g)) out.set(m[1], m[2]);
  return out;
}

/** `relatedScreens` — what each module offers from its own app bar. */
function relatedParents(): string[] {
  const block = nav.slice(
    nav.indexOf("const relatedScreens"),
    nav.indexOf("\n};", nav.indexOf("const relatedScreens")),
  );
  return [...block.matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1]);
}

function relatedChildren(): string[] {
  const block = nav.slice(
    nav.indexOf("const relatedScreens"),
    nav.indexOf("\n};", nav.indexOf("const relatedScreens")),
  );
  return [...block.matchAll(/\('([^']+)',\s*'[^']*'\)/g)].map((m) => m[1]);
}

/** Routes with a screen of their own rather than a generic list. */
const OWN_SCREEN = new Set(["/dashboard", "/calendar", "/approvals", "/dashboard/performance"]);

/**
 * Lists a bespoke screen reads itself. The approvals queue is one: it has its
 * own screen because a row there carries Approve and Reject, which a generic
 * list cannot draw — but it still reads `/list/approvals`.
 */
const READ_BY_OWN_SCREEN = new Set(["approvals"]);
/** The Masters & Users module is web-only, by design — brief §12. */
const WEB_ONLY = new Set(["/masters"]);

describe("the app reaches every entry the web's sidebar can show", () => {
  const map = hrefToModule();
  const hrefs = NAVIGATION.flatMap((s) => s.items.map((i) => i.href));

  it("read both sides", () => {
    expect(hrefs.length).toBeGreaterThan(15);
    expect(map.size).toBeGreaterThan(10);
  });

  it("every navigable route leads to a list, its own screen, or the web", () => {
    const orphan = hrefs.filter(
      (h) => !map.has(h) && !OWN_SCREEN.has(h) && !WEB_ONLY.has(h),
    );
    expect(orphan, "these would be dead rows in the drawer").toEqual([]);
  });

  it("claims no list the boundary does not serve", () => {
    const unknown = [...map.values()].filter((k) => !MOBILE_LIST_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });

  /*
   * A route with a screen of its own must not also claim a list, or the shell
   * would open the generic list instead of the screen that was designed.
   */
  it("does not map a route that has its own screen", () => {
    for (const h of OWN_SCREEN) expect(map.has(h), h).toBe(false);
    for (const h of WEB_ONLY) expect(map.has(h), h).toBe(false);
  });
});

describe("the screens the web reaches from inside another screen", () => {
  it("hang off a module the sidebar actually has", () => {
    const owned = new Set(hrefToModule().values());
    const orphan = relatedParents().filter((p) => !owned.has(p));
    expect(orphan, "these parents are not in the menu").toEqual([]);
  });

  it("are lists the boundary serves", () => {
    const unknown = relatedChildren().filter((k) => !MOBILE_LIST_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });

  /*
   * And between the sidebar and these, nothing the boundary serves is
   * unreachable. A list the server answers that no screen opens is work that
   * was done and then lost.
   */
  it("leave no list unreachable", () => {
    const reachable = new Set([
      ...hrefToModule().values(),
      ...relatedChildren(),
      ...READ_BY_OWN_SCREEN,
    ]);
    const stranded = MOBILE_LIST_KEYS.filter((k) => !reachable.has(k));
    expect(stranded, "no screen opens these").toEqual([]);
  });
});

describe("every screen the app can open is described", () => {
  it("so its filters and labels come from the server", () => {
    const reachable = [
      ...hrefToModule().values(),
      ...relatedChildren(),
      ...READ_BY_OWN_SCREEN,
    ];
    const undescribed = reachable.filter((k) => !SCREENS[k]);
    expect(undescribed, "add these to src/lib/screens/registry.ts").toEqual([]);
  });
});
