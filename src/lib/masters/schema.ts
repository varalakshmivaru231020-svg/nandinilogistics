/**
 * Pure master-engine logic: schema building, value coercion, query shaping.
 *
 * Deliberately free of `server-only` and of any Prisma client import, so it can
 * be unit-tested and reasoned about on its own. Anything that touches the
 * database lives in ./service.ts.
 */
import { z } from "zod";

import type { MasterDef } from "./types";

/** Builds a Zod schema from the field config. */
export function buildSchema(def: MasterDef) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const f of def.fields) {
    let s: z.ZodTypeAny;

    switch (f.type) {
      case "number":
      case "decimal": {
        let n = z.coerce.number({ message: `${f.label} must be a number` });
        if (f.min !== undefined) n = n.min(f.min, `${f.label} must be at least ${f.min}`);
        if (f.max !== undefined) n = n.max(f.max, `${f.label} must be at most ${f.max}`);
        if (f.type === "number") n = n.int(`${f.label} must be a whole number`);
        s = f.required ? n : n.nullable().optional();
        break;
      }
      case "checkbox":
        s = z.coerce.boolean().default(false);
        break;
      case "email": {
        const e = z.string().trim().email(`${f.label} must be a valid email address`);
        s = f.required ? e : e.or(z.literal("")).nullable().optional();
        break;
      }
      default: {
        const t = z.string().trim();
        s = f.required ? t.min(1, `${f.label} is required`) : t.nullable().optional();
      }
    }

    shape[f.name] = s;
  }

  return z.object(shape);
}

/** Normalises parsed values into what Prisma expects (empty string -> null). */
export function toPrismaData(def: MasterDef, values: Record<string, unknown>) {
  const data: Record<string, unknown> = {};

  for (const f of def.fields) {
    let v = values[f.name];

    if (f.type === "checkbox") {
      data[f.name] = Boolean(v);
      continue;
    }

    if (v === "" || v === undefined) v = null;
    if (v !== null && f.uppercase && typeof v === "string") v = v.toUpperCase();

    // A non-required numeric left blank means "unset", not zero.
    if ((f.type === "number" || f.type === "decimal") && v !== null) v = Number(v);

    data[f.name] = v;
  }

  return data;
}

/** Case-insensitive search across the master's configured search fields. */
export function searchFilter(def: MasterDef, term: string) {
  if (!term.trim()) return {};
  return {
    OR: def.searchFields.map((field) => ({
      [field]: { contains: term.trim(), mode: "insensitive" as const },
    })),
  };
}

/** `include` clause covering the relations the list shows. */
export function listInclude(def: MasterDef) {
  if (!def.listRelations) return undefined;
  const include: Record<string, unknown> = {};
  for (const [relation, field] of Object.entries(def.listRelations)) {
    include[relation] = { select: { [field]: true } };
  }
  return include;
}

/**
 * Default ordering for a master list.
 *
 * Not every master has a `code` column (numbering series and cities do not),
 * so the fallback is derived from the master's own field config rather than
 * assumed.
 */
export function defaultOrderBy(def: MasterDef): Record<string, "asc" | "desc"> {
  if (def.defaultSort) return { [def.defaultSort.field]: def.defaultSort.dir };
  const names = new Set(def.fields.map((f) => f.name));
  if (names.has("code")) return { code: "asc" };
  if (names.has("name")) return { name: "asc" };
  const first = def.fields.find((f) => f.type !== "checkbox");
  return first ? { [first.name]: "asc" } : { createdAt: "desc" };
}

/** A short human label for the audit trail. */
export function recordLabel(def: MasterDef, row: Record<string, unknown>): string {
  const name = row.name ?? row.prefix ?? row.documentKey ?? row.id;
  const code = row.code;
  return code ? `${code} — ${name}` : String(name);
}
