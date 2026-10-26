"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import {
  correctLine, createImport, holdLine, planImport, postImport, releaseLine, type ImportPlan,
} from "@/lib/payouts/service";
import { employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";

/**
 * Payout management — SOW §3.4. Admin imports a company's sheet, reviews it,
 * matches any Rider ID the sheet got wrong, and posts it; posting is what the
 * riders and Team Leaders see. A posted line can be held with a reason, and
 * released.
 */

const REFRESH = ["/payouts", "/payouts/imports", "/dashboard"];
function refresh(id?: string) {
  for (const p of REFRESH) revalidatePath(p);
  if (id) revalidatePath(`/payouts/imports/${id}`);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function dayFrom(formData: FormData, name: string, label: string): Date {
  const raw = String(formData.get(name) ?? "").trim();
  if (!ISO_DAY.test(raw)) throw new Error(`${label} must be a date.`);
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) throw new Error(`${label} is not a real date.`);
  return d;
}

/** What the preview and the import both read from the form. */
async function readImportForm(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!companyId) throw new Error("Choose the company whose sheet this is.");
  const periodFrom = dayFrom(formData, "periodFrom", "Period from");
  const periodTo = dayFrom(formData, "periodTo", "Period to");
  let sheet;
  try {
    sheet = await parseUploadFrom(formData);
  } catch (err) {
    if (err instanceof ImportFileError) throw new Error(err.message);
    throw err;
  }
  const file = formData.get("file");
  const fileName = file && typeof file !== "string" ? file.name : "payout.xlsx";
  return { companyId, periodFrom, periodTo, sheet, fileName };
}

/** A plan as the client can hold it — the raw rows are not sent back. */
export interface ImportPreview {
  company: string;
  missing: string[];
  ignored: string[];
  matched: number;
  unmatched: number;
  invalid: number;
  lines: Array<{
    row: number;
    riderCode: string;
    employeeName: string | null;
    totalPayout: number;
    advance: number | null;
    bikeRental: number | null;
    tds: number | null;
    finalPayout: number | null;
    errors: string[];
  }>;
}

function preview(plan: ImportPlan): ImportPreview {
  return {
    company: plan.company.name,
    missing: plan.missing,
    ignored: plan.ignored,
    matched: plan.matched,
    unmatched: plan.unmatched,
    invalid: plan.invalid,
    lines: plan.lines.map((l) => ({
      row: l.row,
      riderCode: l.riderCode,
      employeeName: l.employeeName,
      totalPayout: l.totalPayout,
      advance: l.advance,
      bikeRental: l.bikeRental,
      tds: l.tds,
      finalPayout: l.finalPayout,
      errors: l.errors,
    })),
  };
}

export async function previewPayoutImportAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  return runAction(async () => {
    await authorize(PERM.payout.import.create);
    const { companyId, periodFrom, periodTo, sheet } = await readImportForm(formData);
    const plan = await planImport(prisma, companyId, periodFrom, periodTo, sheet);
    return preview(plan);
  });
}

export async function createPayoutImportAction(formData: FormData): Promise<ActionResult<{ id: string; lines: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.import.create);
    const { companyId, periodFrom, periodTo, sheet, fileName } = await readImportForm(formData);

    const result = await prisma.$transaction(async (tx) => {
      const plan = await planImport(tx, companyId, periodFrom, periodTo, sheet);
      return createImport(tx, plan, periodFrom, periodTo, fileName, ctx.id);
    });

    await recordAudit({
      action: "CREATE", entity: "PayoutImport", entityId: result.id, userId: ctx.id,
      summary: `Imported payout sheet ${fileName} — ${result.lines} rows`,
    });
    refresh(result.id);
    return result;
  });
}

export async function correctPayoutLineAction(lineId: string, employeeId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.import.correct);
    const line = await prisma.payoutLine.findUnique({ where: { id: lineId }, select: { importId: true, riderCode: true } });
    if (!line) throw new Error("That line is not on any sheet.");
    await prisma.$transaction((tx) => correctLine(tx, lineId, employeeId));
    await recordAudit({
      action: "UPDATE", entity: "PayoutLine", entityId: lineId, userId: ctx.id,
      summary: `Matched sheet row ${line.riderCode} to a rider`,
    });
    refresh(line.importId);
    return null;
  });
}

export async function postPayoutImportAction(id: string): Promise<ActionResult<{ lines: number; deducted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.import.post);
    const result = await prisma.$transaction((tx) => postImport(tx, id, ctx.id));
    await recordAudit({
      action: "APPROVE", entity: "PayoutImport", entityId: id, userId: ctx.id,
      summary: `Posted payout sheet — ${result.lines} riders, ₹${result.deducted.toLocaleString("en-IN")} of advances recovered`,
    });
    refresh(id);
    return result;
  });
}

export async function deletePayoutImportAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.import.delete);
    const imp = await prisma.payoutImport.findUnique({ where: { id }, select: { status: true, fileName: true } });
    if (!imp) throw new Error("That sheet does not exist.");
    if (imp.status === "POSTED") throw new Error("A posted sheet cannot be deleted — hold the lines instead.");
    await prisma.payoutImport.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "PayoutImport", entityId: id, userId: ctx.id,
      summary: `Deleted draft payout sheet ${imp.fileName}`,
    });
    refresh();
    return null;
  });
}

/** Holding is scoped like seeing: a Team Leader holds only their team's. */
async function assertInScope(ctx: Awaited<ReturnType<typeof authorize>>, lineId: string) {
  const scope = await resolveViewerScope(prisma, ctx, PERM.payout.payout.viewAll);
  const line = await prisma.payoutLine.findFirst({
    where: { id: lineId, employee: employeeScopeWhere(scope) },
    select: { id: true, riderCode: true, importId: true, import: { select: { status: true } } },
  });
  if (!line) throw new Error("That payout line is not in your view.");
  if (line.import.status !== "POSTED") throw new Error("Only a posted payout can be held or released.");
  return line;
}

export async function holdPayoutLineAction(lineId: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.payout.hold);
    const line = await assertInScope(ctx, lineId);
    await prisma.$transaction((tx) => holdLine(tx, lineId, reason));
    await recordAudit({
      action: "UPDATE", entity: "PayoutLine", entityId: lineId, userId: ctx.id,
      summary: `Held payout for ${line.riderCode} — ${reason.trim()}`,
    });
    refresh(line.importId);
    return null;
  });
}

export async function releasePayoutLineAction(lineId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.payout.payout.hold);
    const line = await assertInScope(ctx, lineId);
    await prisma.$transaction((tx) => releaseLine(tx, lineId));
    await recordAudit({
      action: "UPDATE", entity: "PayoutLine", entityId: lineId, userId: ctx.id,
      summary: `Released payout for ${line.riderCode}`,
    });
    refresh(line.importId);
    return null;
  });
}
