/**
 * Generates the mobile action registry from the server actions themselves.
 *
 * The Android client cannot call a server action: it is a POST to an opaque id
 * with a body shaped by the component tree. But the action is still exactly the
 * right thing to run — it does its own `authorize()`, its own state checks, its
 * own `recordAudit()`, and it already answers in the `{ ok, ... }` envelope the
 * app parses. So the boundary dispatches to it rather than reimplementing it,
 * and the whole permission model comes along for free.
 *
 * Hand-writing one route per action would mean 153 files that rot the moment an
 * argument changes. This reads the signatures instead, the way
 * `generate-permission-codes.ts` reads the permission registry.
 *
 *   pnpm mobile:sync
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const APP = join(ROOT, "src", "app");

/** The Masters & Users module is web-only — brief §12. */
const webOnly = (rel: string) => rel.includes("/masters/") || rel.includes("/admin/");

/**
 * The mobile boundary owns its own sign-in: it issues a bearer token rather
 * than a cookie, and checks `admin.mobile.use` on top of the password. The web
 * login action would set a cookie nothing on the phone would ever send back.
 */
const OWN_AUTH = new Set(["login/login", "login/logout"]);

interface Arg {
  name: string;
  kind: "text" | "ids" | "form" | "bool" | "num" | "enum" | "json";
  optional: boolean;
  nullable: boolean;
  /** For `enum`: the literals the type allows, checked at the boundary. */
  values?: string[];
}

interface Found {
  module: string;
  action: string;
  fnName: string;
  file: string;
  args: Arg[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** The text between the parentheses of a declaration, however many lines. */
function paramText(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return "";
}

/** A parameter list can carry doc comments; they are not parameters. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Splits a parameter list on commas that are not inside brackets. */
function splitParams(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("<([{".includes(ch)) depth += 1;
    if (">)]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) { out.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((p) => p.trim()).filter(Boolean);
}

/** The literals of a string-literal union, or null if it is not one. */
function literalsOf(type: string): string[] | null {
  const parts = type.split("|").map((p) => p.trim().replace(/\s*=.*$/, ""));
  const quoted = parts.filter((p) => /^"[^"]*"$/.test(p));
  if (quoted.length === 0 || quoted.length !== parts.filter((p) => p && p !== "undefined").length) {
    return null;
  }
  return quoted.map((p) => p.slice(1, -1));
}

function kindOf(type: string): { kind: Arg["kind"]; values?: string[] } | null {
  const bare = type.replace(/\s*=\s*[^,]+$/, "").trim();
  const t = bare.replace(/\s|\bundefined\b|\bnull\b|\|/g, "");

  if (t.includes("FormData")) return { kind: "form" };
  if (/^string\[\]$|^Array<string>$/.test(t)) return { kind: "ids" };

  const lits = literalsOf(bare);
  if (lits) return { kind: "enum", values: lits };

  if (t === "boolean") return { kind: "bool" };
  if (t === "number") return { kind: "num" };
  if (t === "string") return { kind: "text" };

  /*
   * Anything else is a record or a list of them — an indent's items, a
   * purchase order's lines, a tower's planned units. Every one of these actions
   * parses its input with zod before touching the database, so the boundary
   * carries the JSON through and lets the action be the gate. Validating it a
   * second time here would be a second definition of the same shape, and the
   * two would drift.
   */
  if (/^[A-Z]/.test(t) || t.startsWith("z.infer") || t.includes("{") || t.endsWith("[]")) {
    return { kind: "json" };
  }
  return null;
}

const found: Found[] = [];
const skipped: string[] = [];

for (const file of walk(APP)) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (webOnly(rel)) continue;
  const src = readFileSync(file, "utf8");
  if (!src.includes("use server")) continue;

  // The module key is the route folder the action serves, route groups removed.
  const dir = relative(join(APP), file).split("\\").join("/").replace(/\/[^/]+$/, "");
  const moduleKey = dir.replace(/\([a-z-]+\)\/?/g, "").replace(/\/$/, "");

  const re = /export async function ([a-zA-Z0-9_]+)Action\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const action = m[1];
    if (action === "run") continue;
    const params = splitParams(stripComments(paramText(src, re.lastIndex - 1)));

    const key = `${moduleKey}/${action}`;
    if (OWN_AUTH.has(key)) continue;

    const args: Arg[] = [];
    let usable = true;
    for (const p of params) {
      const [left, ...rest] = p.split(":");
      const name = left.replace(/[?=].*$/, "").trim();
      /*
       * `remarks = ""` and `overrideMismatch = false` carry no annotation —
       * TypeScript infers the type from the default, so this does too.
       */
      const annotated = rest.join(":").trim();
      const fallback = /=\s*(".*"|'.*'|true|false|-?\d+(\.\d+)?)\s*$/.exec(p);
      const type = annotated || (fallback
        ? (/^["']/.test(fallback[1]) ? "string"
          : /true|false/.test(fallback[1]) ? "boolean" : "number")
        : "");
      const resolved = type ? kindOf(type) : null;
      if (!resolved) { usable = false; break; }
      args.push({
        name,
        kind: resolved.kind,
        values: resolved.values,
        optional: /\?\s*:/.test(p) || p.includes("="),
        /*
         * The action's own signature says whether nothing is an answer. A
         * `projectId: string | null` means "that project, or none"; a form
         * leaves such a box empty, and an empty string is not an id.
         */
        nullable: /\|\s*(null|undefined)\b/.test(annotated),
      });
    }
    if (!usable) { skipped.push(`${key}  (${params.join(", ")})`); continue; }

    found.push({ module: moduleKey || "app", action, fnName: `${action}Action`, file: rel, args });
  }
}

found.sort((a, b) => `${a.module}/${a.action}`.localeCompare(`${b.module}/${b.action}`));

// One import alias per file, so two actions of the same name stay apart.
const byFile = new Map<string, string>();
for (const f of found) {
  if (byFile.has(f.file)) continue;
  const alias = `a${byFile.size}`;
  byFile.set(f.file, alias);
}

const imports = [...byFile.entries()]
  .map(([file, alias]) => {
    const spec = "@/" + file.replace(/^src\//, "").replace(/\.ts$/, "");
    return `import * as ${alias} from "${spec}";`;
  })
  .sort()
  .join("\n");

const entries = found
  .map((f) => {
    const args = f.args
      .map((a) => {
        const values = a.values ? `, values: [${a.values.map((v) => `"${v}"`).join(", ")}]` : "";
        return `{ name: "${a.name}", kind: "${a.kind}"${values}${a.optional ? ", optional: true" : ""}${a.nullable ? ", nullable: true" : ""} }`;
      })
      .join(", ");
    return `  "${f.module}/${f.action}": {\n    fn: ${byFile.get(f.file)}.${f.fnName} as MobileAction,\n    args: [${args}],\n  },`;
  })
  .join("\n");

const out = `/* GENERATED by \`pnpm mobile:sync\` — do not edit by hand.
 *
 * Every server action the Android client may call, keyed by the route folder it
 * belongs to and its name. The key is the endpoint:
 *
 *   POST /api/mobile/v1/do/tasks/acceptTask   { "args": ["<task id>"] }
 *
 * Keyed by module as well as name because two actions share a name:
 * \`requestExtension\` asks for more time on a task in one module and on a
 * schedule activity in another, and they check different permissions.
 *
 * The action is dispatched as-is. It authorizes itself, checks its own state,
 * writes its own audit row and answers in the envelope the app already parses —
 * so the boundary adds a permission check for the device and nothing else.
 */
import "server-only";

${imports}

export type MobileArgKind =
  | "text" | "ids" | "form" | "bool" | "num" | "enum" | "json";

export interface MobileArg {
  name: string;
  kind: MobileArgKind;
  /** For \`enum\`: the only values the boundary will pass through. */
  values?: string[];
  optional?: boolean;
  /**
   * The action takes \`| null\` here, so nothing is an answer: a missing value
   * and an empty box both arrive as null rather than as "".
   */
  nullable?: boolean;
}

/** Positional arguments in, an ActionResult out. */
export type MobileAction = (...args: never[]) => Promise<unknown>;

export interface MobileActionDef {
  fn: MobileAction;
  args: MobileArg[];
}

export const MOBILE_ACTIONS: Record<string, MobileActionDef> = {
${entries}
};

/** Action keys, for the parity test and for \`/api/mobile/v1/do\`. */
export const MOBILE_ACTION_KEYS = Object.keys(MOBILE_ACTIONS).sort();
`;

writeFileSync(join(ROOT, "src", "lib", "api", "mobile-actions.ts"), out);
console.log(`Wrote src/lib/api/mobile-actions.ts — ${found.length} actions.`);
if (skipped.length) {
  console.log(`\n${skipped.length} not dispatchable (argument types the boundary cannot carry):`);
  for (const s of skipped) console.log("  " + s);
}

/* ------------------------------------------------------------------------- *
 * The list endpoints.
 *
 * Every list in the app already has an export route, and an export route is the
 * same query the screen runs — the same filters, the same project scope, the
 * same ownership rules. With `format=json` it answers with the rows instead of
 * a file, so the client needs no second implementation of thirty-six queries
 * that would drift from the first.
 * ------------------------------------------------------------------------- */

const API = join(ROOT, "src", "app", "api");

const lists: Array<{ key: string; file: string }> = [];
for (const file of walk(API)) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (!rel.endsWith("/export/route.ts")) continue;
  if (webOnly(rel)) continue;
  const key = rel
    .replace(/^src\/app\/api\//, "")
    .replace(/\/export\/route\.ts$/, "");
  /*
   * A dynamic segment means the handler takes route params as a second
   * argument, so it cannot be called with a request alone. Masters are web-only
   * anyway; reports are in scope and get their own endpoint, because the key
   * chooses the report rather than filtering one.
   */
  if (key.includes("[")) continue;
  lists.push({ key, file: rel });
}
lists.sort((a, b) => a.key.localeCompare(b.key));

const listImports = lists
  .map(({ file }, i) => {
    const spec = "@/" + file.replace(/^src\//, "").replace(/\.ts$/, "");
    return `import { GET as l${i} } from "${spec}";`;
  })
  .join("\n");

const listEntries = lists.map(({ key }, i) => `  "${key}": l${i},`).join("\n");

const listOut = `/* GENERATED by \`pnpm mobile:sync\` — do not edit by hand.
 *
 * Every list the Android client may read:
 *
 *   GET /api/mobile/v1/list/material/indents?status=DRAFT&from=2026-10-01
 *
 * Each one is the export route for that list, answering with rows rather than a
 * file. That is deliberate: the export route already runs the screen's own
 * query, with the screen's filters, the caller's project scope and the
 * ownership rule that hides other people's records. A second implementation for
 * the phone would be a second definition of "what this list contains", and the
 * two would disagree within a release.
 *
 * Reading a list is not exporting it, so the export permission is not required
 * — see \`exportGate\` in src/lib/exports/respond.ts.
 */
import "server-only";

${listImports}

export type ListHandler = (request: Request) => Promise<Response>;

export const MOBILE_LISTS: Record<string, ListHandler> = {
${listEntries}
};

export const MOBILE_LIST_KEYS = Object.keys(MOBILE_LISTS).sort();
`;

writeFileSync(join(ROOT, "src", "lib", "api", "mobile-lists.ts"), listOut);
console.log(`Wrote src/lib/api/mobile-lists.ts — ${lists.length} lists.`);
