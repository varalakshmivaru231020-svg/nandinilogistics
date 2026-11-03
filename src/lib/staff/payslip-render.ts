import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { put } from "@/lib/storage";
import type { Issuer } from "@/lib/pdf/brand";
import { toPayslipPdf, type PayslipPdfInput } from "./payslip-pdf";

/** What the payslip prints about the staff member. */
export const PAYSLIP_EMPLOYEE_SELECT = {
  id: true, name: true, employeeCode: true, status: true, joinedOn: true,
  pan: true, pfNumber: true, insuranceNumber: true,
  bankName: true, bankAccountNo: true, bankIfsc: true,
  designation: { select: { name: true } },
  employmentType: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

export type PayslipEmployee = Prisma.EmployeeGetPayload<{ select: typeof PAYSLIP_EMPLOYEE_SELECT }>;

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The letterhead carries Nandini Logistics' own particulars, kept on the
 * Internal Staff company record so Admin can change them without a deploy.
 */
export async function payslipIssuer(db: Db): Promise<Issuer> {
  const row = await db.company.findUnique({
    where: { code: "INTERNAL" },
    select: { addressLine: true, phone: true, email: true, gstin: true },
  });
  return {
    name: "Nandini Logistics",
    tagline: "Follow your dreams",
    addressLine: row?.addressLine ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    gstin: row?.gstin ?? null,
  };
}

/** The PDF's input from the person and the figures, so the action and the regeneration script agree. */
export function payslipPdfInput(
  employee: PayslipEmployee,
  figures: Omit<PayslipPdfInput, keyof PayslipEmployee | "employeeCode" | "name" | "designation" | "joinedOn" | "pan" | "pfNumber" | "insuranceNumber" | "bankName" | "bankAccountNo" | "bankIfsc">,
): PayslipPdfInput {
  return {
    employeeCode: employee.employeeCode,
    name: employee.name,
    designation: employee.designation?.name ?? null,
    joinedOn: employee.joinedOn,
    pan: employee.pan,
    pfNumber: employee.pfNumber,
    insuranceNumber: employee.insuranceNumber,
    bankName: employee.bankName,
    bankAccountNo: employee.bankAccountNo,
    bankIfsc: employee.bankIfsc,
    ...figures,
  };
}

/** Renders and stores the PDF; returns the storage key. */
export async function storePayslipPdf(employeeId: string, input: PayslipPdfInput): Promise<string> {
  const pdf = await toPayslipPdf(input);
  const stored = await put(`payslip-${employeeId}`, `payslip-${input.month}.pdf`, pdf, "application/pdf");
  return stored.key;
}
