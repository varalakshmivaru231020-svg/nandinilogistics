import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_ACTION_KEYS } from "@/lib/api/mobile-actions";
import { PARITY, type ParityReason } from "@/lib/api/parity";

/**
 * Web → mobile action parity, worked out rather than asserted.
 *
 * `mobile-actions.ts` is generated from every `…Action` the web exports, so it
 * is the web's own list of what a user can do. An action is reachable from the
 * phone when a record offers it, a form submits it, or the app's own Dart calls
 * it — all three are text, so this reads them.
 *
 * Anything unreachable must be classified in `src/lib/api/parity.ts`. That is
 * the whole point: a gap is either closed or written down with a reason, and
 * "the mobile app is complete" stops being something anybody can say from
 * memory.
 */

const ROOT = join(__dirname, "..", "..");

function read(dir: string, ext: string): string {
  let out = "";
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(ext)) out += readFileSync(path, "utf8");
    }
  };
  walk(dir);
  return out;
}

const SERVER = read(join(ROOT, "src", "lib", "records"), ".ts") +
  read(join(ROOT, "src", "lib", "forms"), ".ts");
const DART = read(join(ROOT, "mobile", "lib"), ".dart");

function reachable(action: string): boolean {
  return (
    SERVER.includes(`"${action}"`) ||
    DART.includes(`'${action}'`) ||
    DART.includes(`"${action}"`)
  );
}

const unreachable = MOBILE_ACTION_KEYS.filter((a) => !reachable(a));

describe("every action the web has is reachable from the app, or written down", () => {
  it("classifies every unreachable action", () => {
    const unclassified = unreachable.filter((a) => !PARITY[a]);
    expect(
      unclassified,
      `these actions are on the web and unreachable from the app, with no reason given in src/lib/api/parity.ts:\n  ${unclassified.join("\n  ")}`,
    ).toEqual([]);
  });

  it("does not carry a reason for an action that is reachable after all", () => {
    const stale = Object.keys(PARITY).filter((a) => reachable(a));
    expect(stale, `reachable now — remove from parity.ts:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("names only actions that exist", () => {
    const keys = new Set<string>(MOBILE_ACTION_KEYS);
    const ghosts = Object.keys(PARITY).filter((a) => !keys.has(a));
    expect(ghosts, `no such action:\n  ${ghosts.join("\n  ")}`).toEqual([]);
  });

  /**
   * The count that matters. Every `todo` is a gap somebody can still open the
   * web for and the phone cannot do — so the number is printed, and the day it
   * reaches zero this becomes `toEqual([])`.
   */
  it("reports what is still missing", () => {
    const todo = unreachable.filter((a) => PARITY[a]?.reason === "todo");
    const byReason = unreachable.reduce<Record<ParityReason, number>>(
      (acc, a) => {
        const r = PARITY[a].reason;
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
      },
      {} as Record<ParityReason, number>,
    );
    console.log(
      `\n  mobile parity: ${MOBILE_ACTION_KEYS.length - unreachable.length} of ` +
        `${MOBILE_ACTION_KEYS.length} web actions reachable from the app\n` +
        Object.entries(byReason)
          .map(([r, n]) => `    ${n}  ${r}`)
          .join("\n") +
        (todo.length ? `\n  still to build:\n    ${todo.join("\n    ")}` : "\n  nothing left to build") +
        "\n",
    );
    expect(todo.length, "see docs/MOBILE_PARITY.md").toBeLessThanOrEqual(
      Number(process.env.PARITY_TODO_CAP ?? 60),
    );
  });
});
