"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { hashPassword } from "@/lib/auth/password";
import { markAttendance } from "@/lib/hr/attendance-marking";
import { editableEmployee, maskIdentityChanges } from "@/lib/hr/employee-audit";
import { checkStatusChange, claimEmployeeStatus, statusLabel } from "@/lib/hr/employee-status";
import { employeeScope } from "@/lib/hr/list-filters";
import { nextDocumentNumber } from "@/lib/numbering";
import { mergeOfferLetter, renderOfferLetterPdf } from "@/lib/offer-letter";
import {
  AADHAAR_RE, aadhaarDigits, IFSC_RE, isInternalStaffType, isRiderType, MANDATORY_RIDER_DOCS,
  onboardingChecklist, onboardingTransition, PAN_RE, RIDER_DOC_KINDS,
} from "@/lib/riders/onboarding";
import { referralCodeFor } from "@/lib/riders/referrals";
import { FileTooLargeError, UnsupportedFileTypeError, put, remove } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

/**
 * The onboarding form — SOW §3.2. Name, mobile, Aadhaar and the employment
 * type are mandatory for everyone; the rider-only particulars (emergency
 * numbers, bank, companies) are checked at submission by the onboarding
 * checklist, so a draft can be saved half-filled and finished later.
 */
const EmployeeSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  mobile: z.string().trim().min(8, "A valid mobile number is required"),
  aadhaar: z.string().trim().refine((v) => AADHAAR_RE.test(aadhaarDigits(v)), "Aadhaar must be 12 digits"),
  pan: z.string().trim().toUpperCase().refine((v) => v === "" || PAN_RE.test(v), "PAN should look like ABCDE1234F").optional(),
  address: z.string().trim().optional(),
  altContact: z.string().trim().optional(),
  employmentTypeId: z.string().min(1, "Employment type is required"),
  designationId: z.string().optional(),
  emergencyMobileFamily: z.string().trim().optional(),
  emergencyMobileFriend: z.string().trim().optional(),
  bankAccountNo: z.string().trim().optional(),
  bankHolderName: z.string().trim().optional(),
  bankIfsc: z.string().trim().toUpperCase().refine((v) => v === "" || IFSC_RE.test(v), "IFSC should look like HDFC0001234").optional(),
  bankName: z.string().trim().optional(),
  pfNumber: z.string().trim().optional(),
  drivingLicence: z.string().trim().toUpperCase().optional(),
  insuranceNumber: z.string().trim().optional(),
  monthlySalary: z.string().trim().optional(),
  joinedOn: z.string().trim().optional(),
});

/** The companies a multi-select posts: repeated `companyIds`, or one comma list. */
function readCompanyIds(formData: FormData): string[] {
  const raw = formData.getAll("companyIds").flatMap((v) => String(v).split(","));
  return [...new Set(raw.map((v) => v.trim()).filter(Boolean))].sort();
}

function readSalary(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Monthly salary must be a number.");
  return n;
}

function readDay(value: string | undefined, label: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a date.`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} must be a date.`);
  return d;
}

/** Stores one uploaded file, turning the storage rules into form errors. */
async function store(employeeId: string, file: File) {
  try {
    return await put(`employee-${employeeId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

/**
 * Saves the photo and the KYC copies the form offers. Replacing one removes
 * what it replaced, so nothing is orphaned in storage.
 */
async function saveFiles(employeeId: string, formData: FormData, uploadedById: string) {
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const previous = await prisma.employee.findUnique({ where: { id: employeeId }, select: { photoKey: true } });
    const stored = await store(employeeId, photo);
    await prisma.employee.update({ where: { id: employeeId }, data: { photoKey: stored.key } });
    if (previous?.photoKey) await remove(previous.photoKey).catch(() => undefined);
  }

  for (const kind of RIDER_DOC_KINDS) {
    const file = formData.get(`doc:${kind}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const previous = await prisma.employeeDocument.findUnique({
      where: { employeeId_kind: { employeeId, kind } },
      select: { storageKey: true },
    });
    const stored = await store(employeeId, file);
    await prisma.employeeDocument.upsert({
      where: { employeeId_kind: { employeeId, kind } },
      create: {
        employeeId, kind, storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
      update: {
        storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
    });
    if (previous?.storageKey) await remove(previous.storageKey).catch(() => undefined);
  }
}

/** The particulars the form posts, as the row stores them. */
function particularsOf(v: z.infer<typeof EmployeeSchema>) {
  return {
    name: v.name,
    mobile: v.mobile,
    aadhaar: aadhaarDigits(v.aadhaar),
    pan: v.pan || null,
    address: v.address || null,
    altContact: v.altContact || null,
    employmentTypeId: v.employmentTypeId,
    designationId: v.designationId || null,
    emergencyMobileFamily: v.emergencyMobileFamily || null,
    emergencyMobileFriend: v.emergencyMobileFriend || null,
    bankAccountNo: v.bankAccountNo || null,
    bankHolderName: v.bankHolderName || null,
    bankIfsc: v.bankIfsc || null,
    bankName: v.bankName || null,
    pfNumber: v.pfNumber || null,
    drivingLicence: v.drivingLicence || null,
    insuranceNumber: v.insuranceNumber || null,
    monthlySalary: readSalary(v.monthlySalary),
    joinedOn: readDay(v.joinedOn, "Joining date"),
  };
}

async function assertCompaniesExist(ids: string[]) {
  if (ids.length === 0) return;
  const found = await prisma.company.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new Error("One of the companies chosen does not exist.");
}

/** Loads a record inside the viewer's scope, or refuses as not found. */
async function scopedEmployee(ctx: Awaited<ReturnType<typeof authorize>>, id: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    include: {
      employmentType: { select: { name: true } },
      companies: { select: { companyId: true } },
      documents: { select: { kind: true } },
      lead: { select: { id: true, ownerId: true, stageId: true } },
    },
  });
  if (!employee) throw new Error("Rider not found.");
  return employee;
}

export async function createEmployeeAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.create);
    const parsed = EmployeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const data = particularsOf(parsed.data);
    const companyIds = readCompanyIds(formData);
    await assertCompaniesExist(companyIds);

    const employee = await prisma.$transaction(async (tx) => {
      // The Rider ID — NL001 — from the series Masters holds.
      const employeeCode = await nextDocumentNumber(tx, "RIDER");
      return tx.employee.create({
        data: {
          employeeCode,
          ...data,
          referralCode: referralCodeFor(employeeCode),
          companies: companyIds.length ? { create: companyIds.map((companyId) => ({ companyId })) } : undefined,
        },
      });
    });

    await saveFiles(employee.id, formData, ctx.id);

    await recordAudit({
      action: "CREATE", entity: "Employee", entityId: employee.id, userId: ctx.id,
      summary: `Added ${employee.name} as ${employee.employeeCode} — onboarding draft`,
    });
    revalidatePath("/hr");
    revalidatePath("/hr/onboarding");
    return { id: employee.id };
  });
}

export async function updateEmployeeAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.update);
    const parsed = EmployeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const before = await scopedEmployee(ctx, id);
    const data = particularsOf(parsed.data);
    const companyIds = formData.has("companyIds") ? readCompanyIds(formData) : before.companies.map((c) => c.companyId).sort();
    await assertCompaniesExist(companyIds);
    if (companyIds.join() !== before.companies.map((c) => c.companyId).sort().join() && !ctx.has(PERM.hr.employee.manageCompanies)) {
      throw new Error("You do not have permission to change the companies this rider is deployed to.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data });
      await tx.riderCompany.deleteMany({ where: { employeeId: id, companyId: { notIn: companyIds } } });
      await tx.riderCompany.createMany({
        data: companyIds.map((companyId) => ({ employeeId: id, companyId })),
        skipDuplicates: true,
      });
    });
    await saveFiles(id, formData, ctx.id);

    const beforeDay = before.joinedOn ? before.joinedOn.toISOString().slice(0, 10) : null;
    // Every field the form changed; identity and bank numbers masked to their last four.
    const changes = maskIdentityChanges(diff(
      editableEmployee({ ...before, monthlySalary: before.monthlySalary === null ? null : Number(before.monthlySalary), joinedOn: beforeDay, companyIds: before.companies.map((c) => c.companyId) }),
      editableEmployee({ ...data, joinedOn: data.joinedOn ? data.joinedOn.toISOString().slice(0, 10) : null, companyIds }),
    ));
    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: changes
        ? `${data.name} updated — ${Object.keys(changes).join(", ")}`
        : `${data.name} saved with no changes`,
      changes,
    });
    revalidatePath("/hr");
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

/**
 * Activates or deactivates a rider. Deactivating needs a reason and records
 * the day they left. The write is claimed against the status that was read,
 * so a concurrent change wins rather than being overwritten.
 */
export async function setEmployeeStatusAction(
  id: string,
  status: string,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.update);
    const before = await prisma.employee.findFirst({ where: { id, ...employeeScope(ctx) }, select: { id: true, name: true, status: true } });
    if (!before) throw new Error("Rider not found.");

    const change = checkStatusChange(before.status, status, reason);
    if (!change.ok) throw new Error(change.error);

    const claimed = await claimEmployeeStatus(prisma, id, before.status, change.next);
    if (!claimed) {
      throw new Error(`${before.name}'s status was changed by someone else. Reload and try again.`);
    }
    await prisma.employee.update({
      where: { id },
      data: { leftOn: change.next === "INACTIVE" ? new Date() : null },
    });

    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${before.name} marked ${statusLabel(change.next).toLowerCase()}${change.reason ? ` — ${change.reason}` : ""}`,
      changes: {
        status: { from: before.status, to: change.next },
        ...(change.reason ? { reason: { from: null, to: change.reason } } : {}),
      },
    });
    revalidatePath("/hr");
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.delete);
    const employee = await prisma.employee.findFirst({
      where: { id, ...employeeScope(ctx) },
      include: { _count: { select: { attendance: true, payoutLines: true, advances: true } } },
    });
    if (!employee) throw new Error("Rider not found.");
    if (employee._count.attendance > 0 || employee._count.payoutLines > 0 || employee._count.advances > 0) {
      throw new Error(
        `${employee.name} has attendance, payouts or advances on record. Mark them as Left instead of deleting.`,
      );
    }
    await prisma.employee.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `Removed ${employee.name}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/* ------------------------------- Onboarding ------------------------------- */

/**
 * Submits a draft (or a rejected form) for review. Everything the SOW makes
 * mandatory has to be on the form first, and the refusal names what is not.
 */
export async function submitOnboardingAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.submitOnboarding);
    const e = await scopedEmployee(ctx, id);
    const move = onboardingTransition(e.onboardingStatus, "SUBMITTED");
    if (!move.ok) throw new Error(move.error);

    const missing = onboardingChecklist(
      { ...e, companyIds: e.companies.map((c) => c.companyId), isRider: isRiderType(e.employmentType.name) },
      e.documents.map((d) => d.kind),
    );
    if (missing.length) throw new Error(`Before it can be submitted the form still needs: ${missing.join(", ")}.`);

    await prisma.employee.update({
      where: { id },
      data: { onboardingStatus: "SUBMITTED", submittedAt: new Date(), rejectionReason: null },
    });
    await recordAudit({
      action: "SUBMIT", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${e.name} (${e.employeeCode}) submitted for onboarding review`,
      changes: { onboardingStatus: { from: e.onboardingStatus, to: "SUBMITTED" } },
    });
    revalidatePath("/hr");
    revalidatePath("/hr/onboarding");
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

/**
 * Generates the offer letter from the company's template and stores it.
 * Returns what happened, so acceptance can note a missing template rather
 * than fail on it.
 */
async function generateOfferLetter(employeeId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: {
      employmentType: { select: { name: true } },
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
  const first = e.companies[0]?.company;
  if (!first) return { ok: false, reason: "no company is assigned" };
  const internal = isInternalStaffType(e.employmentType.name) || first.code === "INTERNAL";
  const template = internal ? first.offerTemplateInternal : first.offerTemplateVendor;
  if (!template) return { ok: false, reason: `${first.name} has no ${internal ? "internal staff" : "vendor rider"} offer letter template mapped` };

  const letter = mergeOfferLetter(template, {
    name: e.name,
    riderId: e.employeeCode,
    company: e.companies.map((c) => c.company.name).join(", "),
    joiningDate: formatDate(e.joinedOn ?? new Date()),
    rateCard: first.rateCardFileName ? `as per the ${first.name} rate card (${first.rateCardFileName})` : `as per the ${first.name} rate card`,
  });
  const pdf = await renderOfferLetterPdf(letter, { riderId: e.employeeCode, generatedAt: new Date() });
  const stored = await put(`employee-${e.id}`, `offer-letter-${e.employeeCode}.pdf`, pdf, "application/pdf");
  const previous = e.offerLetterKey;
  await prisma.employee.update({ where: { id: e.id }, data: { offerLetterKey: stored.key, offerLetterAt: new Date() } });
  if (previous) await remove(previous).catch(() => undefined);
  return { ok: true };
}

/**
 * Accepts a submitted form: the rider becomes active, the offer letter is
 * generated, the onboarding WhatsApp goes out, the tele-caller who owns the
 * lead is told, and the lead itself moves to the Onboarding stage.
 */
export async function acceptOnboardingAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.acceptOnboarding);
    const e = await scopedEmployee(ctx, id);
    const move = onboardingTransition(e.onboardingStatus, "ACCEPTED");
    if (!move.ok) throw new Error(move.error);

    const now = new Date();
    const onboardingStage = await prisma.leadStage.findFirst({
      where: { kind: "ONBOARDING", status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          onboardingStatus: "ACCEPTED",
          status: "ACTIVE",
          decidedAt: now,
          decidedById: ctx.id,
          rejectionReason: null,
          joinedOn: e.joinedOn ?? now,
        },
      });
      if (e.lead && onboardingStage && e.lead.stageId !== onboardingStage.id) {
        await tx.lead.update({ where: { id: e.lead.id }, data: { stageId: onboardingStage.id } });
      }
      if (e.lead?.ownerId && e.lead.ownerId !== ctx.id) {
        await tx.notification.create({
          data: {
            userId: e.lead.ownerId,
            kind: "ONBOARDING_ACCEPTED",
            title: `${e.name} accepted as ${e.employeeCode}`,
            body: "The rider is active. The offer letter and the app link have been sent.",
            href: `/hr/${id}`,
            entity: "Employee",
            entityId: id,
          },
        });
      }
    });

    const letter = await generateOfferLetter(id);
    const whatsapp = await sendWhatsAppTemplate({
      to: e.mobile,
      template: "rider_onboarding",
      params: [e.name, e.employeeCode, process.env.APP_DOWNLOAD_URL ?? ""],
    });

    await recordAudit({
      action: "APPROVE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${e.name} (${e.employeeCode}) accepted — rider active` +
        (letter.ok ? "; offer letter generated" : `; no offer letter: ${letter.reason}`) +
        (whatsapp.sent ? "; onboarding WhatsApp sent" : `; WhatsApp not sent (${whatsapp.reason})`),
      changes: { onboardingStatus: { from: e.onboardingStatus, to: "ACCEPTED" } },
    });
    revalidatePath("/hr");
    revalidatePath("/hr/onboarding");
    revalidatePath(`/hr/${id}`);
    if (e.lead) revalidatePath(`/sales/leads/${e.lead.id}`);
    return null;
  });
}

/** Rejects a submitted form with a reason. The form can be corrected and resubmitted. */
export async function rejectOnboardingAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.rejectOnboarding);
    const e = await scopedEmployee(ctx, id);
    const move = onboardingTransition(e.onboardingStatus, "REJECTED");
    if (!move.ok) throw new Error(move.error);
    const why = reason.trim();
    if (why.length < 3) throw new Error("Give a reason for rejecting this form.");

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { onboardingStatus: "REJECTED", decidedAt: new Date(), decidedById: ctx.id, rejectionReason: why },
      });
      if (e.lead?.ownerId && e.lead.ownerId !== ctx.id) {
        await tx.notification.create({
          data: {
            userId: e.lead.ownerId,
            kind: "ONBOARDING_REJECTED",
            title: `${e.name}'s onboarding form was rejected`,
            body: why,
            href: `/hr/${id}`,
            entity: "Employee",
            entityId: id,
          },
        });
      }
    });

    await recordAudit({
      action: "REJECT", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `${e.name} (${e.employeeCode}) rejected — ${why}`,
      changes: { onboardingStatus: { from: e.onboardingStatus, to: "REJECTED" }, reason: { from: null, to: why } },
    });
    revalidatePath("/hr");
    revalidatePath("/hr/onboarding");
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

/** Produces the offer letter again — after a template change, or a company change. */
export async function regenerateOfferLetterAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.offerLetter);
    const e = await scopedEmployee(ctx, id);
    if (e.onboardingStatus !== "ACCEPTED") throw new Error("An offer letter is produced once the rider is accepted.");
    const letter = await generateOfferLetter(id);
    if (!letter.ok) throw new Error(`The offer letter could not be produced: ${letter.reason}.`);
    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `Offer letter regenerated for ${e.name} (${e.employeeCode})`,
    });
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

/** Sends the stored offer letter's notice over WhatsApp. */
export async function sendOfferLetterWhatsAppAction(id: string): Promise<ActionResult<{ sent: boolean; reason?: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.offerLetter);
    const e = await scopedEmployee(ctx, id);
    if (!e.offerLetterKey) throw new Error("There is no offer letter on this record yet.");
    const result = await sendWhatsAppTemplate({
      to: e.mobile,
      template: "rider_offer_letter",
      params: [e.name, e.employeeCode],
    });
    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: result.sent
        ? `Offer letter sent to ${e.name} on WhatsApp`
        : `Offer letter WhatsApp to ${e.name} not sent (${result.reason})`,
    });
    return result.sent ? { sent: true } : { sent: false, reason: result.reason };
  });
}

/**
 * Sets the 4-digit PIN a rider signs in to the app with. Stored hashed, like
 * a password; nobody can read it back. A rider without a login gets one.
 */
export async function setRiderPinAction(id: string, pin: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.setPin);
    const e = await scopedEmployee(ctx, id);
    if (!/^\d{4}$/.test(pin)) throw new Error("The PIN must be exactly 4 digits.");
    if (e.onboardingStatus !== "ACCEPTED") throw new Error("A PIN is set once the rider is accepted.");

    const pinHash = await hashPassword(pin);
    const userId = await prisma.$transaction(async (tx) => {
      if (e.userId) {
        await tx.user.update({ where: { id: e.userId }, data: { pinHash, phone: e.mobile } });
        return e.userId;
      }
      const role = await tx.role.findUnique({ where: { code: "RIDER" }, select: { id: true } });
      const user = await tx.user.create({
        data: {
          employeeCode: e.employeeCode,
          name: e.name,
          email: `${e.employeeCode.toLowerCase()}@riders.nandini.local`,
          phone: e.mobile,
          // No password: the app signs in with the PIN. A random hash keeps
          // the password route closed without a second column.
          passwordHash: await hashPassword(`${e.id}:${Date.now()}:${Math.random()}`),
          pinHash,
          createdById: ctx.id,
          roles: role ? { create: [{ roleId: role.id }] } : undefined,
        },
      });
      await tx.employee.update({ where: { id }, data: { userId: user.id } });
      return user.id;
    });

    await recordAudit({
      action: "UPDATE", entity: "Employee", entityId: id, userId: ctx.id,
      summary: `PIN set for ${e.name} (${e.employeeCode})${e.userId ? "" : " — app login created"}`,
      changes: { userId: { from: e.userId, to: userId } },
    });
    revalidatePath(`/hr/${id}`);
    return null;
  });
}

/**
 * Starts a rider's onboarding from a lead that has reached the Onboarding
 * stage: a draft record pre-filled from the lead, linked back to it.
 */
export async function startOnboardingFromLeadAction(leadId: string): Promise<ActionResult<{ id: string }>> {
  const result = await runAction(async () => {
    const ctx = await authorize(PERM.hr.employee.create);
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { rider: { select: { id: true } }, companies: { select: { companyId: true } } },
    });
    if (!lead) throw new Error("Lead not found.");
    if (!ctx.has(PERM.sales.lead.viewAll) && lead.ownerId !== ctx.id) throw new Error("Lead not found.");
    if (lead.rider) return { id: lead.rider.id };

    const riderType = await prisma.employmentType.findFirst({
      where: { name: { equals: "Rider", mode: "insensitive" } },
      select: { id: true },
    });
    if (!riderType) throw new Error('Add an employment type named "Rider" under Masters → Workforce Setup first.');

    const employee = await prisma.$transaction(async (tx) => {
      const employeeCode = await nextDocumentNumber(tx, "RIDER");
      return tx.employee.create({
        data: {
          employeeCode,
          name: lead.name,
          mobile: lead.phone,
          altContact: lead.altPhone,
          aadhaar: "",
          address: lead.location,
          employmentTypeId: riderType.id,
          leadId: lead.id,
          referralCode: referralCodeFor(employeeCode),
          companies: lead.companies.length
            ? { create: lead.companies.map((c) => ({ companyId: c.companyId })) }
            : undefined,
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Employee", entityId: employee.id, userId: ctx.id,
      summary: `Onboarding started for ${lead.name} from lead ${lead.leadNo} — ${employee.employeeCode}`,
    });
    await recordAudit({
      action: "UPDATE", entity: "Lead", entityId: lead.id, userId: ctx.id,
      summary: `Onboarding started — rider ${employee.employeeCode}`,
    });
    revalidatePath("/hr");
    revalidatePath(`/sales/leads/${leadId}`);
    return { id: employee.id };
  });
  if (result.ok) redirect(`/hr/${result.data.id}`);
  return result;
}

/* --------------------------- Employment types ----------------------------- */

export async function createEmploymentTypeAction(name: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employmentType.create);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A name is required.");

    const existing = await prisma.employmentType.findUnique({ where: { name: trimmed } });
    if (existing) throw new Error(`"${trimmed}" already exists.`);

    await prisma.employmentType.create({ data: { name: trimmed } });
    await recordAudit({
      action: "CREATE", entity: "EmploymentType", userId: ctx.id,
      summary: `Employment type added — ${trimmed}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/** The design only offers the delete when the type carries nobody. */
export async function deleteEmploymentTypeAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.employmentType.delete);
    const type = await prisma.employmentType.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!type) throw new Error("Employment type not found.");
    if (type._count.employees > 0) {
      throw new Error(`${type.name} still carries ${type._count.employees} person(s).`);
    }
    await prisma.employmentType.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "EmploymentType", entityId: id, userId: ctx.id,
      summary: `Employment type removed — ${type.name}`,
    });
    revalidatePath("/hr");
    return null;
  });
}

/* -------------------------------- Attendance ------------------------------ */

/**
 * Marking is idempotent on (employee, date): re-marking a day corrects it
 * rather than stacking a second row. Inactive employees are refused inside
 * `markAttendance()`, under a lock, and nothing is written for the batch.
 */
export async function markAttendanceAction(
  attendanceOn: string,
  marks: Array<{ employeeId: string; status: string; overtimeHours?: number }>,
): Promise<ActionResult<{ marked: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.hr.attendance.mark);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceOn)) throw new Error("Pick a valid date.");
    const date = new Date(`${attendanceOn}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Pick a valid date.");
    if (date.getTime() > Date.now() + 86_400_000) {
      throw new Error("Attendance cannot be marked for a future date.");
    }
    if (!marks.length) throw new Error("Nothing to mark.");

    const marked = await prisma.$transaction((tx) =>
      markAttendance(tx, { date, marks, markedById: ctx.id }),
    );

    await recordAudit({
      action: "UPDATE", entity: "AttendanceEntry", userId: ctx.id,
      summary: `${marked} marked for ${attendanceOn}`,
    });
    revalidatePath("/hr");
    return { marked };
  });
}

// MANDATORY_RIDER_DOCS is exported for the screen through the onboarding module;
// referenced here so the import stays honest about what submission checks.
void MANDATORY_RIDER_DOCS;
