/**
 * Emits src/lib/permissions/codes.ts — a typed tree of every permission code,
 * so application code references PERM.material.indent.approvePm rather than a
 * string literal that no compiler is checking.
 *
 * Run via: pnpm perms:codegen  (also runs as part of pnpm perms:sync)
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

import { PERMISSIONS } from "../src/lib/permissions/registry";

type Tree = Record<string, Record<string, Record<string, string>>>;

const tree: Tree = {};
for (const p of PERMISSIONS) {
  tree[p.module] ??= {};
  tree[p.module][p.resource] ??= {};
  tree[p.module][p.resource][p.action] = p.code;
}

const indent = (n: number) => "  ".repeat(n);

const body = Object.entries(tree)
  .map(([mod, resources]) => {
    const inner = Object.entries(resources)
      .map(([res, actions]) => {
        const lines = Object.entries(actions)
          .map(([action, code]) => `${indent(3)}${JSON.stringify(action)}: ${JSON.stringify(code)},`)
          .join("\n");
        return `${indent(2)}${JSON.stringify(res)}: {\n${lines}\n${indent(2)}},`;
      })
      .join("\n");
    return `${indent(1)}${JSON.stringify(mod)}: {\n${inner}\n${indent(1)}},`;
  })
  .join("\n");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: src/lib/permissions/registry.ts
 * Regenerate: pnpm perms:codegen
 *
 * ${PERMISSIONS.length} permission codes.
 */

export const PERM = {
${body}
} as const;

type Leaves<T> = T extends string
  ? T
  : { [K in keyof T]: Leaves<T[K]> }[keyof T];

/** Union of every permission code string in the platform. */
export type PermCode = Leaves<typeof PERM>;
`;

const target = resolve(__dirname, "../src/lib/permissions/codes.ts");
writeFileSync(target, out, "utf8");
console.log(`Wrote ${target} — ${PERMISSIONS.length} codes.`);
