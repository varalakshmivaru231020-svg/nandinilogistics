"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { FileTooLargeError, UnsupportedFileTypeError, put, remove } from "@/lib/storage";
import { parseHub, parsePayoutColumnMap } from "@/lib/companies/hubs";

/**
 * The company's own screen — SOW §3.3: hubs with a map position, the Team
 * Leaders assigned, the rate card, the offer letter templates and the payout
 * sheet mapping. The master list (create, rename, deactivate) stays on the
 * masters engine; this is everything the engine's one form cannot hold.
 */

const RATE_CARD_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

async function companyOrThrow(id: string) {
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!company) throw new Error("Company not found.");
  return company;
}

const paths = (companyId: string) => {
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/masters");
};

/* ----------------------------------- hubs ---------------------------------- */

export async function addCompanyLocationAction(companyId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.manageHubs);
    const company = await companyOrThrow(companyId);
    const hub = parseHub(Object.fromEntries(formData));
    const row = await prisma.companyLocation.create({ data: { companyId, ...hub } });
    await recordAudit({
      action: "CREATE", entity: "CompanyLocation", entityId: row.id, userId: ctx.id,
      summary: `Added hub ${hub.name} to ${company.name}`,
    });
    paths(companyId);
    return { id: row.id };
  });
}

export async function updateCompanyLocationAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.manageHubs);
    const existing = await prisma.companyLocation.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
    if (!existing) throw new Error("Hub not found.");
    const hub = parseHub(Object.fromEntries(formData));
    await prisma.companyLocation.update({ where: { id }, data: hub });
    await recordAudit({
      action: "UPDATE", entity: "CompanyLocation", entityId: id, userId: ctx.id,
      summary: `Changed hub ${hub.name} of ${existing.company.name}`,
    });
    paths(existing.companyId);
    return null;
  });
}

export async function toggleCompanyLocationAction(id: string): Promise<ActionResult<{ isActive: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.manageHubs);
    const existing = await prisma.companyLocation.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
    if (!existing) throw new Error("Hub not found.");
    const isActive = !existing.isActive;
    await prisma.companyLocation.update({ where: { id }, data: { isActive } });
    await recordAudit({
      action: "UPDATE", entity: "CompanyLocation", entityId: id, userId: ctx.id,
      summary: `${isActive ? "Reopened" : "Closed"} hub ${existing.name} of ${existing.company.name}`,
    });
    paths(existing.companyId);
    return { isActive };
  });
}

/* ------------------------------ team leaders ------------------------------- */

export async function setCompanyTeamLeadersAction(companyId: string, userIds: string[]): Promise<ActionResult<{ assigned: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.assignTeamLeaders);
    const company = await companyOrThrow(companyId);
    const wanted = [...new Set(userIds.map((u) => String(u).trim()).filter(Boolean))];

    // Only somebody who can work a task — a Team Leader by the role matrix —
    // may lead a company; anyone else named here is refused, not ignored.
    const leaders = new Set(await usersHolding(prisma, PERM.task.task.start));
    const stranger = wanted.find((id) => !leaders.has(id));
    if (stranger) throw new Error("Only a Team Leader can be assigned to a company.");

    await prisma.$transaction([
      prisma.companyTeamLeader.deleteMany({ where: { companyId } }),
      prisma.companyTeamLeader.createMany({ data: wanted.map((userId) => ({ companyId, userId })), skipDuplicates: true }),
    ]);
    await recordAudit({
      action: "ASSIGN", entity: "Company", entityId: companyId, userId: ctx.id,
      summary: `Assigned ${wanted.length} Team Leader${wanted.length === 1 ? "" : "s"} to ${company.name}`,
    });
    paths(companyId);
    return { assigned: wanted.length };
  });
}

/* --------------------------------- rate card -------------------------------- */

export async function uploadRateCardAction(companyId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.uploadRateCard);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, rateCardKey: true } });
    if (!company) throw new Error("Company not found.");
    const file = formData.get("rateCard");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose the rate card — a photo or a PDF.");
    if (!RATE_CARD_MIME.has(file.type)) throw new Error("The rate card must be a PDF, JPEG, PNG or WebP.");

    let stored;
    try {
      stored = await put(`company-${companyId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
    } catch (err) {
      if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) throw new Error(err.message);
      throw err;
    }
    await prisma.company.update({ where: { id: companyId }, data: { rateCardKey: stored.key, rateCardFileName: file.name } });
    if (company.rateCardKey) await remove(company.rateCardKey).catch(() => undefined);

    await recordAudit({
      action: "UPDATE", entity: "Company", entityId: companyId, userId: ctx.id,
      summary: `Uploaded rate card ${file.name} for ${company.name}`,
    });
    paths(companyId);
    return null;
  });
}

/* ------------------------------ offer templates ----------------------------- */

export async function setCompanyOfferTemplatesAction(
  companyId: string,
  internalId: string | null,
  vendorId: string | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.update);
    const company = await companyOrThrow(companyId);
    const check = async (id: string | null, audience: "INTERNAL" | "VENDOR") => {
      if (!id) return null;
      const t = await prisma.offerLetterTemplate.findUnique({ where: { id }, select: { id: true, audience: true, status: true } });
      if (!t || t.status !== "ACTIVE") throw new Error("That offer letter template is not available.");
      if (t.audience !== audience) {
        throw new Error(`That template is written for ${t.audience === "INTERNAL" ? "internal staff" : "vendor riders"}.`);
      }
      return t.id;
    };
    const data = {
      offerTemplateInternalId: await check(internalId, "INTERNAL"),
      offerTemplateVendorId: await check(vendorId, "VENDOR"),
    };
    await prisma.company.update({ where: { id: companyId }, data });
    await recordAudit({
      action: "UPDATE", entity: "Company", entityId: companyId, userId: ctx.id,
      summary: `Set the offer letter templates for ${company.name}`,
      changes: { offerTemplateInternalId: { from: null, to: data.offerTemplateInternalId }, offerTemplateVendorId: { from: null, to: data.offerTemplateVendorId } },
    });
    paths(companyId);
    return null;
  });
}

/* ------------------------------ payout mapping ------------------------------ */

export async function setPayoutColumnMapAction(companyId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.company.mapPayoutColumns);
    const company = await companyOrThrow(companyId);
    const values = Object.fromEntries(formData);
    const cycle = values.payoutCycle === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const map = parsePayoutColumnMap(values);
    await prisma.company.update({ where: { id: companyId }, data: { payoutCycle: cycle, payoutColumnMap: map } });
    await recordAudit({
      action: "UPDATE", entity: "Company", entityId: companyId, userId: ctx.id,
      summary: `Mapped the ${cycle.toLowerCase()} payout sheet columns for ${company.name}`,
      changes: { payoutColumnMap: { from: null, to: map } },
    });
    paths(companyId);
    return null;
  });
}
