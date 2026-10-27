"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { whatsappSiteVisitScheduled } from "@/lib/whatsapp/notify";
import { PERM } from "@/lib/permissions/codes";

export async function scheduleSiteVisitAction(
  leadId: string,
  scheduledAt: string,
  projectId: string | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.siteVisit.schedule);
    if (!scheduledAt) throw new Error("Pick a date and time for the visit.");

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.ownerId !== ctx.id && !ctx.has(PERM.sales.lead.viewAll)) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only schedule visits for your own leads.");
    }

    await prisma.$transaction([
      prisma.siteVisit.create({
        data: {
          leadId,
          projectId: projectId ?? lead.projectId,
          scheduledAt: new Date(scheduledAt),
          conductedById: ctx.id,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          state: lead.state === "NEW" || lead.state === "CONTACTED" ? "SITE_VISIT_SCHEDULED" : lead.state,
          nextActionAt: new Date(scheduledAt),
        },
      }),
    ]);

    await recordAudit({
      action: "CREATE", entity: "SiteVisit", entityId: leadId, userId: ctx.id,
      summary: `Scheduled a site visit for ${lead.name} on ${new Date(scheduledAt).toLocaleString("en-IN")}`,
    });

    /*
     * And the client is told, on WhatsApp — where to come, when, and who will
     * meet them. After the audit row: the visit is booked whatever happens to
     * the message, and `enqueueWhatsApp` never throws into this flow.
     *
     * Off until an administrator switches it on at Masters & Users → WhatsApp,
     * and refused there until the template is approved by Meta.
     */
    const [site, executive] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId ?? lead.projectId ?? "" },
        select: { name: true, addressLine: true, city: { select: { name: true } } },
      }),
      // Their own number, so the client can reach somebody before setting off.
      prisma.user.findUnique({ where: { id: ctx.id }, select: { name: true, phone: true } }),
    ]);
    await whatsappSiteVisitScheduled(prisma, {
      leadId,
      client: { name: lead.name, phone: lead.phone },
      project: site?.name ?? "our project",
      address: [site?.addressLine, site?.city?.name].filter(Boolean).join(", ") || "—",
      scheduledAt: new Date(scheduledAt),
      executive: { name: executive?.name ?? ctx.name, phone: executive?.phone ?? null },
    });

    revalidatePath("/sales/site-visits");
    revalidatePath("/sales/leads");
    return null;
  });
}

export async function completeSiteVisitAction(
  visitId: string,
  feedback: string,
  rating: number,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.siteVisit.complete);

    const visit = await prisma.siteVisit.findUnique({
      where: { id: visitId },
      include: { lead: { select: { id: true, name: true, state: true } } },
    });
    if (!visit) throw new Error("Site visit not found.");
    if (visit.visitedAt) throw new Error("This visit is already recorded as done.");

    await prisma.$transaction([
      prisma.siteVisit.update({
        where: { id: visitId },
        data: { visitedAt: new Date(), feedback: feedback || null, rating: rating || null },
      }),
      prisma.lead.update({
        where: { id: visit.lead.id },
        data: {
          state: visit.lead.state === "SITE_VISIT_SCHEDULED" ? "VISIT_DONE" : visit.lead.state,
        },
      }),
    ]);

    await recordAudit({
      action: "UPDATE", entity: "SiteVisit", entityId: visitId, userId: ctx.id,
      summary: `Recorded the site visit outcome for ${visit.lead.name}${rating ? ` — rated ${rating}/5` : ""}`,
    });

    revalidatePath("/sales/site-visits");
    return null;
  });
}

export async function cancelSiteVisitAction(visitId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.siteVisit.cancel);

    const visit = await prisma.siteVisit.findUnique({
      where: { id: visitId },
      include: { lead: { select: { name: true } } },
    });
    if (!visit) throw new Error("Site visit not found.");
    if (visit.visitedAt) throw new Error("A completed visit cannot be cancelled.");

    await prisma.siteVisit.delete({ where: { id: visitId } });
    await recordAudit({
      action: "CANCEL", entity: "SiteVisit", entityId: visitId, userId: ctx.id,
      summary: `Cancelled the scheduled site visit for ${visit.lead.name}`,
    });

    revalidatePath("/sales/site-visits");
    return null;
  });
}
