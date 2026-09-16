"use server";

import { revalidatePath } from "next/cache";

import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { planMasterImport } from "@/lib/masters/import";
import { getMaster, masterPerm } from "@/lib/masters/registry";
import { buildSchema, delegate, loadOptions, recordLabel, toPrismaData } from "@/lib/masters/service";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";

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

/* ---------------------------- Lead form fields ----------------------------- */

const LEAD_FIELD_TYPES = [
  "TEXT", "PHONE", "EMAIL", "NUMBER", "DROPDOWN", "DESCRIPTION", "CHECKBOX", "DATE",
] as const;

type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];

/**
 * The Capture-lead form is configuration: Lead Settings owns which fields it
 * asks, what each one is, and whether it is mandatory. The nine system fields
 * map to columns on the lead, so their type and their place are fixed — only
 * whether they are mandatory can change.
 */
export async function addLeadFieldAction(
  label: string,
  type: string,
  required: boolean,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.leadField.create);
    const name = label.trim();
    if (name.length < 2) throw new Error("Give the field a name.");
    if (!LEAD_FIELD_TYPES.includes(type as LeadFieldType)) throw new Error("Unknown field type.");

    const last = await prisma.leadFormField.findFirst({ orderBy: { sortOrder: "desc" } });
    const field = await prisma.leadFormField.create({
      data: {
        fieldKey: `custom_${Date.now().toString(36)}`,
        label: name,
        type: type as LeadFieldType,
        required,
        isSystem: false,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "LeadFormField", entityId: field.id, userId: ctx.id,
      summary: `Added lead form field ${name}`,
    });
    revalidatePath("/masters");
    revalidatePath("/sales/leads");
    return { id: field.id };
  });
}

export async function updateLeadFieldAction(
  id: string,
  patch: { type?: string; required?: boolean; label?: string },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.leadField.update);
    const field = await prisma.leadFormField.findUnique({ where: { id } });
    if (!field) throw new Error("Field not found.");

    if (patch.type && !LEAD_FIELD_TYPES.includes(patch.type as LeadFieldType)) {
      throw new Error("Unknown field type.");
    }
    // A system field answers a column of its own; changing its type would make
    // the form ask for something the lead cannot hold.
    if (field.isSystem && (patch.type || patch.label)) {
      throw new Error("A system field keeps its name and its type.");
    }

    const updated = await prisma.leadFormField.update({
      where: { id },
      data: {
        ...(patch.type ? { type: patch.type as LeadFieldType } : {}),
        ...(patch.label ? { label: patch.label.trim() } : {}),
        ...(patch.required === undefined ? {} : { required: patch.required }),
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "LeadFormField", entityId: id, userId: ctx.id,
      summary: `Updated lead form field ${updated.label}`,
      changes: diff(field, updated, ["type", "required", "label"]),
    });
    revalidatePath("/masters");
    revalidatePath("/sales/leads");
    return null;
  });
}

export async function deleteLeadFieldAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.leadField.delete);
    const field = await prisma.leadFormField.findUnique({ where: { id } });
    if (!field) throw new Error("Field not found.");
    if (field.isSystem) throw new Error("A system field cannot be removed — the lead record needs it.");

    await prisma.leadFormField.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "LeadFormField", entityId: id, userId: ctx.id,
      summary: `Removed lead form field ${field.label}`,
    });
    revalidatePath("/masters");
    revalidatePath("/sales/leads");
    return null;
  });
}
