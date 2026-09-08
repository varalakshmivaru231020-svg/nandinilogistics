import "server-only";

import { prisma } from "@/lib/db";
import type { MasterDef } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// The pure half of the engine lives in ./schema.ts and is re-exported here so
// call sites have a single import.
export {
  buildSchema,
  toPrismaData,
  searchFilter,
  listInclude,
  defaultOrderBy,
  recordLabel,
} from "./schema";

/**
 * Resolves the Prisma delegate for a master. The model name always comes from
 * the registry, never from user input, so this cast cannot be steered into an
 * arbitrary table.
 */
export function delegate(def: MasterDef): any {
  const d = (prisma as any)[def.model];
  if (!d) throw new Error(`Unknown master model: ${def.model}`);
  return d;
}

/** Loads dropdown options for every select field that reads from a table. */
export async function loadOptions(
  def: MasterDef,
): Promise<Record<string, Array<{ value: string; label: string }>>> {
  const result: Record<string, Array<{ value: string; label: string }>> = {};

  for (const f of def.fields) {
    if (f.type !== "select") continue;

    if (f.options) {
      result[f.name] = f.options;
      continue;
    }
    if (!f.optionsFrom) continue;

    const src = f.optionsFrom;
    const d = (prisma as any)[src.model];
    if (!d) continue;

    const rows = await d.findMany({
      where: src.activeOnly ? { status: "ACTIVE" } : undefined,
      select: { id: true, [src.labelField]: true },
      orderBy: { [src.labelField]: "asc" },
      take: 500,
    });

    result[f.name] = rows.map((r: Record<string, unknown>) => ({
      value: String(r.id),
      label: String(r[src.labelField] ?? r.id),
    }));
  }

  return result;
}
