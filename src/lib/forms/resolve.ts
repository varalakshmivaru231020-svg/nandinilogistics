import "server-only";

import type { AuthContext } from "@/lib/rbac/context";
import { loadOptions } from "@/lib/screens/resolve";

import { FORMS } from "./registry";
import type { FormDef, FormFieldDef, ResolvedField, ResolvedForm } from "./types";

/**
 * A form with its dropdowns filled in, for somebody allowed to open it.
 *
 * The option lists come from `loadOptions`, which is the same loader the list
 * filters use — so the project dropdown on "New indent" is exactly the project
 * dropdown on the indent list, scoped to the caller either way.
 */

export type FormRefusal = "unknown-form" | "forbidden";

async function resolveField(f: FormFieldDef, ctx: AuthContext): Promise<ResolvedField> {
  const { source, options, row, ...rest } = f;
  return {
    ...rest,
    options: options ? [...options] : source ? await loadOptions(source, ctx) : undefined,
    row: row ? await Promise.all(row.map((r) => resolveField(r, ctx))) : undefined,
  };
}

export async function resolveForm(
  ctx: AuthContext,
  key: string,
): Promise<ResolvedForm | FormRefusal> {
  const def: FormDef | undefined = FORMS[key];
  if (!def) return "unknown-form";
  if (!ctx.has(def.permission)) return "forbidden";

  const { permission: _permission, when, fields, ...rest } = def;

  // The fuller form, for somebody who may do the fuller thing.
  const upgrade = when && ctx.has(when.permission)
    ? {
        submitLabel: when.submitLabel ?? rest.submitLabel,
        shape: when.shape ?? rest.shape,
        done: when.done ?? rest.done,
      }
    : {};

  return {
    ...rest,
    ...upgrade,
    fields: await Promise.all(fields.map((f) => resolveField(f, ctx))),
    serverTime: new Date().toISOString(),
  };
}
