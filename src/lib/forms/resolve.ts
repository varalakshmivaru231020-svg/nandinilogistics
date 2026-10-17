import "server-only";

import type { AuthContext } from "@/lib/rbac/context";
import { loadOptions } from "@/lib/screens/resolve";

import { attendanceSheetFields, leadFormFields } from "./lead-form";
import { prefillFor } from "./prefill";
import { FORMS } from "./registry";
import type { FormDef, FormFieldDef, ResolvedField, ResolvedForm } from "./types";

/**
 * A form with its dropdowns filled in, for somebody allowed to open it.
 *
 * The option lists come from `loadOptions`, which is the same loader the list
 * filters use — so the project dropdown on "New indent" is exactly the project
 * dropdown on the indent list, scoped to the caller either way.
 */

export type FormRefusal = "unknown-form" | "forbidden" | "no-record" | { refused: string };

async function resolveField(f: FormFieldDef, ctx: AuthContext): Promise<ResolvedField> {
  const { source, options, row, ...rest } = f;
  const list = options ? [...options] : source ? await loadOptions(source, ctx) : undefined;
  return {
    ...rest,
    options: list,
    /*
     * A field the web opens already answered opens already answered here. The
     * list is only known now, so the default is settled now; a prefill still
     * wins, because it is applied after this.
     */
    ...(f.startsFirst && f.initial === undefined && list?.length
      ? { initial: list[0].value }
      : {}),
    row: row ? await Promise.all(row.map((r) => resolveField(r, ctx))) : undefined,
  };
}

export async function resolveForm(
  ctx: AuthContext,
  key: string,
  recordId?: string | null,
): Promise<ResolvedForm | FormRefusal> {
  const def: FormDef | undefined = FORMS[key];
  if (!def) return "unknown-form";
  if (!ctx.has(def.permission)) return "forbidden";

  /*
   * An edit form starts as the record stands. Without that it would send
   * blanks for everything left alone, which on a `FormData` action means
   * clearing them.
   */
  let prefill = null as Awaited<ReturnType<typeof prefillFor>>;
  if (def.edits) {
    if (!recordId) return "no-record";
    prefill = await prefillFor(ctx, key, recordId);
    if (!prefill) return "no-record";
    if (prefill.refusal) return { refused: prefill.refusal };
  } else if (def.seeds && recordId) {
    /*
     * Opened from a record, which fills in what that record implies — the
     * project a task is being raised against. Nothing is required of it: the
     * same form opens from its own list with no record behind it, and then it
     * starts empty, exactly as the web's own "New task" page does.
     */
    prefill = await prefillFor(ctx, key, recordId);
  }

  // The permission, the viewer-dependent half and the raw fields all stay on
  // the server; what is left is what the client is sent.
  const { when, dynamic, fields, ...withPermission } = def;
  const { permission, ...rest } = withPermission;
  void permission;

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
    fields: await (async () => {
      const resolved =
        dynamic === "leadFields"
          ? await leadFormFields(ctx)
          : dynamic === "attendanceSheet"
            ? await attendanceSheetFields(ctx)
            : await Promise.all(fields.map((f) => resolveField(f, ctx)));
      if (!prefill) return resolved;
      return resolved.map((f) => {
        const held = prefill.values[f.name];
        const rows = prefill.rows?.[f.name];
        return {
          ...f,
          ...(held === undefined ? {} : { initial: held }),
          ...(rows ? { initialRows: rows, fixedRows: false } : {}),
          ...(prefill.locked?.includes(f.name) ? { locked: true } : {}),
        };
      });
    })(),
    serverTime: new Date().toISOString(),
  };
}
