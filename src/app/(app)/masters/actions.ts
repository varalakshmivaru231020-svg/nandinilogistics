"use server";

import { revalidatePath } from "next/cache";

import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { planMasterImport } from "@/lib/masters/import";
import { getMaster, masterPerm } from "@/lib/masters/registry";
import { buildSchema, delegate, loadOptions, recordLabel, toPrismaData } from "@/lib/masters/service";

/* eslint-disable @typescript-eslint/no-explicit-any */

function must(key: string) {
  const def = getMaster(key);
  if (!def) throw new Error(`Unknown master: ${key}`);
  return def;
}

/** Turns FormData into the raw shape the schema validates. */
function readForm(def: ReturnType<typeof must>, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of def.fields) {
    raw[f.name] = f.type === "checkbox" ? formData.get(f.name) === "on" : formData.get(f.name);
  }
  return raw;
}

export async function createMasterAction(
  masterKey: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const def = must(masterKey);
    const ctx = await authorize(masterPerm(def, "create"));

    const parsed = buildSchema(def).safeParse(readForm(def, formData));
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
    }

    const data = toPrismaData(def, parsed.data as Record<string, unknown>);
    const created = await delegate(def).create({ data });

    await recordAudit({
      action: "CREATE",
      entity: def.singular,
      entityId: created.id,
      userId: ctx.id,
      summary: `Created ${def.singular} ${recordLabel(def, created)}`,
    });

    revalidatePath(`/masters/${def.key}`);
    return { id: created.id as string };
  });
}

export async function updateMasterAction(
  masterKey: string,
  id: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const def = must(masterKey);
    const ctx = await authorize(masterPerm(def, "update"));

    const parsed = buildSchema(def).safeParse(readForm(def, formData));
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
    }

    const before = await delegate(def).findUnique({ where: { id } });
    if (!before) throw new Error(`This ${def.singular} no longer exists.`);

    const data = toPrismaData(def, parsed.data as Record<string, unknown>);
    const after = await delegate(def).update({ where: { id }, data });

    await recordAudit({
      action: "UPDATE",
      entity: def.singular,
      entityId: id,
      userId: ctx.id,
      summary: `Updated ${def.singular} ${recordLabel(def, after)}`,
      changes: diff(before, after),
    });

    revalidatePath(`/masters/${def.key}`);
    return { id };
  });
}

export async function deleteMasterAction(masterKey: string, id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const def = must(masterKey);
    const ctx = await authorize(masterPerm(def, "delete"));

    const before = await delegate(def).findUnique({ where: { id } });
    if (!before) throw new Error(`This ${def.singular} no longer exists.`);

    try {
      await delegate(def).delete({ where: { id } });
    } catch (err: any) {
      // Foreign-key violation — the record is referenced by live transactions.
      if (err?.code === "P2003") {
        throw new Error(
          `This ${def.singular} is used by existing records and cannot be deleted. Deactivate it instead.`,
        );
      }
      throw err;
    }

    await recordAudit({
      action: "DELETE",
      entity: def.singular,
      entityId: id,
      userId: ctx.id,
      summary: `Deleted ${def.singular} ${recordLabel(def, before)}`,
    });

    revalidatePath(`/masters/${def.key}`);
    return null;
  });
}

export async function toggleMasterStatusAction(
  masterKey: string,
  id: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const def = must(masterKey);
    const ctx = await authorize(masterPerm(def, "toggleStatus"));

    const before = await delegate(def).findUnique({ where: { id } });
    if (!before) throw new Error(`This ${def.singular} no longer exists.`);

    const status = before.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await delegate(def).update({ where: { id }, data: { status } });

    await recordAudit({
      action: "UPDATE",
      entity: def.singular,
      entityId: id,
      userId: ctx.id,
      summary: `${status === "ACTIVE" ? "Activated" : "Deactivated"} ${def.singular} ${recordLabel(def, before)}`,
      changes: { status: { from: before.status, to: status } },
    });

    revalidatePath(`/masters/${def.key}`);
    return { status };
  });
}

/* -------------------------------- import --------------------------------- */

async function planFromUpload(def: ReturnType<typeof must>, formData: FormData) {
  let sheet;
  try {
    sheet = await parseUploadFrom(formData);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new Error("The file could not be read. Save it again as .csv or .xlsx and retry.");
  }

  const hasCode = def.fields.some((f) => f.name === "code");
  const [options, existing] = await Promise.all([
    loadOptions(def),
    hasCode ? delegate(def).findMany({ select: { code: true } }) : Promise.resolve([]),
  ]);
  const codes = new Set<string>(
    (existing as Array<{ code: string | null }>).map((r) => String(r.code ?? "").toUpperCase()),
  );
  return planMasterImport(def, sheet, options, codes);
}

/** Checks every row of an upload and reports what an import would do. Writes nothing. */
export async function previewMasterImportAction(
  masterKey: string,
  formData: FormData,
): Promise<ActionResult<ImportPlan>> {
  return runAction(async () => {
    const def = must(masterKey);
    await authorize(masterPerm(def, "import"));
    const plan = await planFromUpload(def, formData);
    // Only what the user needs to see — the prepared data is rebuilt on import.
    return { ...plan, rows: plan.rows.map(({ row, label, errors, notes }) => ({ row, label, errors, notes })) };
  });
}

/**
 * Imports every valid row of an upload.
 *
 * The file is planned again here rather than trusting the preview the browser
 * saw: the table may have changed since, and the preview is only a courtesy.
 * All rows go in one statement, so an import lands whole or not at all.
 */
export async function importMastersAction(
  masterKey: string,
  formData: FormData,
): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const def = must(masterKey);
    const ctx = await authorize(masterPerm(def, "import"));

    const plan = await planFromUpload(def, formData);
    if (plan.missing.length > 0) throw new Error(`The file is missing: ${plan.missing.join(", ")}.`);

    const data = plan.rows.flatMap((r) => (r.data ? [r.data] : []));
    if (data.length === 0) {
      throw new Error("No row in the file can be imported. Fix the rows marked in the preview and try again.");
    }

    let created: number;
    try {
      ({ count: created } = await delegate(def).createMany({ data }));
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new Error("Some of these records were added by someone else while you were importing. Preview the file again.");
      }
      if (err?.code === "P2003") {
        throw new Error("An entry these rows refer to was removed while you were importing. Preview the file again.");
      }
      throw err;
    }

    const file = formData.get("file");
    const fileName = file && typeof file !== "string" ? file.name : "a file";
    const skipped = plan.invalid;

    await recordAudit({
      action: "CREATE",
      entity: def.singular,
      userId: ctx.id,
      summary: `Imported ${created} ${def.label.toLowerCase()} from ${fileName}${skipped ? ` — ${skipped} row(s) skipped` : ""}`,
    });

    revalidatePath(`/masters/${def.key}`);
    return {
      created,
      skipped,
      message:
        `Imported ${created} ${created === 1 ? def.singular : def.label.toLowerCase()}` +
        (skipped ? `; ${skipped} row(s) with problems were skipped.` : "."),
    };
  });
}
