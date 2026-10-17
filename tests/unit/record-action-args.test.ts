import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";

/**
 * Every action a record offers, counted against the action it calls.
 *
 * Twice in one day a button on the phone did nothing because the record handed
 * its action the wrong number of arguments: judging a checklist point sent the
 * remark as a third argument to an action that takes two, and the boundary
 * answered "This action takes 2 argument(s), not 3." The record compiles
 * either way — `args` is `unknown[]` — so nothing but the running app said so.
 *
 * This reads the arguments out of the record sources and checks the count
 * against the generated registry, with the same rule the app follows: a remark
 * is appended as the last argument, unless the action takes the whole body as
 * `$values`, and then it travels inside that.
 */

const RECORDS_DIR = join(__dirname, "..", "..", "src", "lib", "records");

/**
 * The source without its comments.
 *
 * The parser below tracks quotes, and an apostrophe in a comment — "the web's
 * own form" — reads as the start of a string that never ends. Block comments
 * go, and so do whole-line `//` ones; a `//` inside a string is left alone,
 * which is what keeps a url intact.
 */
function uncommented(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The literal top-level elements of an `args: [ … ]`, however nested. */
function argsAt(src: string, from: number): { count: number; text: string } | null {
  const at = src.indexOf("args: [", from);
  if (at < 0) return null;
  let depth = 0;
  let commas = 0;
  let quote: string | null = null;
  for (let i = at + 6; i < src.length; i++) {
    const c = src[i];
    const previous = src[i - 1];
    if (quote) {
      if (c === quote && previous !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) {
      depth--;
      if (depth === 0) {
        const text = src.slice(at + 6, i + 1);
        const empty = text.replace(/\s/g, "") === "[]";
        // A trailing comma before the bracket is the formatter's, not an
        // argument: `[ { … }, ]` is one argument, not two.
        const trailing = /,\s*\]$/.test(text);
        return { count: empty ? 0 : commas + (trailing ? 0 : 1), text };
      }
    } else if (c === "," && depth === 1) commas++;
  }
  return null;
}

interface Offer {
  file: string;
  action: string;
  args: number;
  text: string;
  remark: string;
}

/** Every `action: "…"` in the record sources, with the args beside it. */
function offers(): Offer[] {
  const out: Offer[] = [];
  for (const file of readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = uncommented(readFileSync(join(RECORDS_DIR, file), "utf8"));
    for (const m of src.matchAll(/\baction:\s*"([^"]+)"/g)) {
      const key = m[1];
      if (!key) continue; // a form-only button calls nothing
      const args = argsAt(src, m.index!);
      if (!args) continue;
      // The remark mode belongs to the same action object.
      const after = src.slice(m.index!, m.index! + 1400);
      const remark = /remark:\s*"(none|optional|required)"/.exec(after)?.[1] ?? "none";
      out.push({ file, action: key, args: args.count, text: args.text, remark });
    }
  }
  return out;
}

describe("a record calls its action with the arguments that action takes", () => {
  const all = offers();

  it("found the records' actions at all", () => {
    expect(all.length).toBeGreaterThan(60);
  });

  for (const offer of all) {
    it(`${offer.file} → ${offer.action} (${offer.args})`, () => {
      const def = MOBILE_ACTIONS[offer.action];
      expect(def, `${offer.file} offers ${offer.action}, which no action registry has`).toBeDefined();

      // The app appends the remark unless the body itself is an argument.
      const carriesBody = offer.text.includes("$values");
      const sent = offer.args + (offer.remark !== "none" && !carriesBody ? 1 : 0);

      expect(
        sent,
        `${offer.file} sends ${sent} argument(s) to ${offer.action}, which takes ${def.args.length}` +
          ` (${def.args.map((a) => `${a.name}: ${a.kind}`).join(", ")})`,
      ).toBeLessThanOrEqual(def.args.length);

      // A `form` argument has to be an object, `$values`, or "@formdata" —
      // never a bare string, which is what sent the verdict as a remark.
      const formArg = def.args.findIndex((a) => a.kind === "form");
      if (formArg >= 0 && formArg < offer.args && offer.remark !== "none") {
        expect(
          carriesBody || offer.text.includes("@formdata"),
          `${offer.action} takes a form at position ${formArg + 1}: the remark belongs inside it, as $values`,
        ).toBe(true);
      }
    });
  }
});
