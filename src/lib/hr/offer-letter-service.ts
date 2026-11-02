import "server-only";

import { prisma } from "@/lib/db";
import { professionalAddress } from "@/lib/hr/address";
import { inr, mergeOfferLetter, renderOfferLetterPdf, type SalaryLine } from "@/lib/offer-letter";
import { isInternalStaffType } from "@/lib/riders/onboarding";
import { statutoryDeductions } from "@/lib/staff/payslip";
import { put, remove } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

/**
 * Generates the offer letter from the company's template and stores it.
 * Returns what happened, so acceptance can note a missing template rather
 * than fail on it.
 */
export async function generateOfferLetter(employeeId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: {
      employmentType: { select: { name: true } },
      designation: { select: { name: true } },
      companies: {
        orderBy: { createdAt: "asc" },
        include: {
          company: {
            include: {
              offerTemplateVendor: true,
              offerTemplateInternal: true,
            },
          },
        },
      },
    },
  });
  // Internal staff and Team Leaders work for Nandini Logistics itself, so with no
  // client company of their own they take the Internal Staff company's letter.
  const staffType = isInternalStaffType(e.employmentType.name) || e.employmentType.name.trim().toLowerCase() === "team leader";
  const first =
    e.companies[0]?.company ??
    (staffType
      ? await prisma.company.findUnique({
          where: { code: "INTERNAL" },
          include: { offerTemplateVendor: true, offerTemplateInternal: true },
        })
      : null);
  if (!first) return { ok: false, reason: "no company is assigned" };
  const internal = staffType || first.code === "INTERNAL";
  const template = internal ? first.offerTemplateInternal : first.offerTemplateVendor;
  if (!template) return { ok: false, reason: `${first.name} has no ${internal ? "internal staff" : "vendor rider"} offer letter template mapped` };

  // Staff carry a monthly salary; the letter shows it and an annexure built
  // from the same statutory rates the payslip uses. Riders are paid by rate
  // card and get neither.
  const monthly = internal && e.monthlySalary !== null ? Number(e.monthlySalary) : null;
  let salary: { lines: SalaryLine[]; note: string } | null = null;
  if (monthly !== null && monthly > 0) {
    const { pf, esi } = statutoryDeductions(monthly, monthly);
    const lines: SalaryLine[] = [{ label: "Basic salary", monthly }];
    if (pf > 0) lines.push({ label: "Provident Fund (employee share)", monthly: pf, deduction: true });
    if (esi > 0) lines.push({ label: "ESI (employee share)", monthly: esi, deduction: true });
    salary = {
      lines,
      note: "Advance recoveries, if any, and attendance-based adjustments are applied on the monthly payslip. Statutory deductions follow the rates in force.",
    };
  }

  // The letterhead carries Nandini Logistics' own particulars, kept on the
  // Internal Staff company record so Admin can change them without a deploy.
  const issuerRow = first.code === "INTERNAL" ? first : await prisma.company.findUnique({ where: { code: "INTERNAL" } });

  const letter = mergeOfferLetter(template, {
    name: e.name,
    riderId: e.employeeCode,
    company: e.companies.length ? e.companies.map((c) => c.company.name).join(", ") : "Nandini Logistics",
    joiningDate: formatDate(e.joinedOn ?? new Date()),
    rateCard: first.rateCardFileName ? `as per the ${first.name} rate card (${first.rateCardFileName})` : `as per the ${first.name} rate card`,
    salary: monthly === null ? "" : `Rs. ${inr(monthly)}`,
    designation: e.designation?.name ?? (internal ? "Staff" : "Delivery rider"),
  });
  const pdf = await renderOfferLetterPdf(letter, {
    riderId: e.employeeCode,
    generatedAt: new Date(),
    addressee: {
      name: e.name,
      designation: e.designation?.name ?? (internal ? null : "Delivery rider"),
      address: professionalAddress(e),
      mobile: e.mobile,
    },
    issuer: {
      name: "Nandini Logistics",
      tagline: "Follow your dreams",
      addressLine: issuerRow?.addressLine ?? null,
      phone: issuerRow?.phone ?? null,
      email: issuerRow?.email ?? null,
      gstin: issuerRow?.gstin ?? null,
    },
    salary,
    signatory: "Authorised Signatory",
  });
  const stored = await put(`employee-${e.id}`, `offer-letter-${e.employeeCode}.pdf`, pdf, "application/pdf");
  const previous = e.offerLetterKey;
  await prisma.employee.update({ where: { id: e.id }, data: { offerLetterKey: stored.key, offerLetterAt: new Date() } });
  if (previous) await remove(previous).catch(() => undefined);
  return { ok: true };
}
