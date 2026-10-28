"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { put, remove } from "@/lib/storage";
import { computePayslip, isMonth } from "@/lib/staff/payslip";
import { toPayslipPdf } from "@/lib/staff/payslip-pdf";
import { payslipDraft } from "@/lib/staff/service";

/**
 * Internal staff payslips — SOW §3.8: gross, advance, deductions, net pay,
 * one per staff member per month, as a PDF.
 */

const paths = (id?: string) => {
  revalidatePath("/staff/payslips");
  if (id) revalidatePath(`/staff/payslips/${id}`);
};

/** The figures the form starts from, for the person and month picked. */
export async function payslipDraftAction(employeeId: string, month: string): Promise<ActionResult<{
  gross: number; pf: number; esi: number; payDays: number; payableDays: number; marked: number; advance: number; name: string;
}>> {
  return runAction(async () => {
    await authorize(PERM.staff.payslip.create);
    if (!isMonth(month)) throw new Error("Pick a month.");
    const draft = await payslipDraft(prisma, employeeId, month);
    return { gross: draft.gross, pf: draft.pf, esi: draft.esi, payDays: draft.payDays, payableDays: draft.payableDays, marked: draft.marked, advance: draft.advance, name: draft.employee.name };
  });
}

export async function generatePayslipAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.staff.payslip.create);
    const employeeId = String(formData.get("employeeId") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!employeeId) throw new Error("Choose the staff member.");
    if (!isMonth(month)) throw new Error("Pick a month as yyyy-mm.");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true, name: true, employeeCode: true, status: true,
        designation: { select: { name: true } },
        employmentType: { select: { name: true } },
      },
    });
    if (!employee) throw new Error("Staff member not found.");
    if (employee.employmentType.name.toLowerCase() !== "internal staff") {
      throw new Error("Payslips are generated for internal staff only; riders are paid through payouts.");
    }

    const existing = await prisma.payslip.findUnique({ where: { employeeId_month: { employeeId, month } }, select: { id: true } });
    if (existing) throw new Error(`A payslip for ${month} already exists for ${employee.name} — delete it to regenerate.`);

    const figures = computePayslip({
      gross: formData.get("gross"),
      basic: formData.get("basic"),
      hra: formData.get("hra"),
      others: formData.get("others"),
      pf: formData.get("pf") ?? 0,
      esi: formData.get("esi") ?? 0,
      advance: formData.get("advance") ?? 0,
      deductions: formData.get("deductions") ?? 0,
    });
    const payableRaw = String(formData.get("payableDays") ?? "").trim();
    const payable = payableRaw === "" ? null : Number(payableRaw);
    if (payable !== null && (!Number.isFinite(payable) || payable < 0 || payable > 31)) {
      throw new Error("Payable days must be between 0 and 31.");
    }
    const payDaysRaw = String(formData.get("payDays") ?? "").trim();
    const payDays = payDaysRaw === "" ? null : Number(payDaysRaw);
    if (payDays !== null && (!Number.isInteger(payDays) || payDays < 1 || payDays > 31)) {
      throw new Error("Pay days must be a whole number between 1 and 31.");
    }
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const pdf = await toPayslipPdf({
      employeeCode: employee.employeeCode,
      name: employee.name,
      designation: employee.designation?.name ?? null,
      month,
      payDays,
      payableDays: payable,
      ...figures,
      notes,
      generatedBy: ctx.name,
      generatedAt: new Date(),
    });
    const stored = await put(`payslip-${employeeId}`, `payslip-${month}.pdf`, pdf, "application/pdf");

    const payslip = await prisma.payslip.create({
      data: {
        employeeId, month, ...figures, payDays, payableDays: payable, notes,
        pdfKey: stored.key, generatedById: ctx.id,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "Payslip", entityId: payslip.id, userId: ctx.id,
      summary: `Generated the ${month} payslip for ${employee.name} — net ₹${figures.netPay.toLocaleString("en-IN")}`,
    });
    paths();
    return { id: payslip.id };
  });
}

export async function deletePayslipAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.staff.payslip.delete);
    const existing = await prisma.payslip.findUnique({ where: { id }, include: { employee: { select: { name: true } } } });
    if (!existing) throw new Error("Payslip not found.");
    await prisma.payslip.delete({ where: { id } });
    if (existing.pdfKey) await remove(existing.pdfKey).catch(() => undefined);
    await recordAudit({
      action: "DELETE", entity: "Payslip", entityId: id, userId: ctx.id,
      summary: `Deleted the ${existing.month} payslip for ${existing.employee.name}`,
    });
    paths();
    return null;
  });
}
