"use server";

import { revalidatePath } from "next/cache";

import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit, diff } from "@/lib/audit";
import { getMaster, masterPerm } from "@/lib/masters/registry";
import { buildSchema, delegate, recordLabel, toPrismaData } from "@/lib/masters/service";

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
