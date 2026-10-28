import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { getSetting } from "@/lib/settings";
import { sendWhatsappNow } from "@/lib/whatsapp/dispatch";
import { whatsappSiteVisitScheduled } from "@/lib/whatsapp/notify";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Everything the client's site-visit message says, worked out once.
 *
 * Two actions raise this message — the schedule form in Site Visits, and a
 * follow-up logged as a site visit on a lead — and each used to assemble it
 * itself. That is how the first messages went out reading "Project: our
 * project / Address: — / Their number: —": nothing was wrong with the
 * template, the action simply had no project in its hand and sent the
 * placeholder.
 *
 * So each field is followed back to wherever the answer actually is, and only
 * as far as the truth goes:
 *
 *   - **Where**: the project the action names, else the lead's own, else the
 *     project of the visit already booked against it.
 *   - **The address**: the project's, else its company's — the office is where
 *     somebody is told to come when no project has been settled on.
 *   - **A number to ring**: the executive's own, else the lead's owner, else
 *     the company's line, else the WhatsApp number this message arrives from,
 *     which is answerable by definition.
 *
 * A field with no answer anywhere is still "—" rather than a guess, and the
 * one field that is never guessed is the time: without it nothing is sent at
 * all, and the log says so.
 */
export async function tellClientAboutSiteVisit(
  db: Db,
  input: {
    leadId: string;
    /** The time as the action holds it. Null sends nothing. */
    scheduledAt: Date | null;
    /** Whoever is arranging it — the acting user. */
    by: { id: string; name: string };
    /** The project the visit is at, where the action knows which. */
    projectId?: string | null;
  },
): Promise<void> {
  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, name: true, phone: true, projectId: true, ownerId: true },
  });
  if (!lead) return;

  const visit = await db.siteVisit.findFirst({
    where: { leadId: lead.id, visitedAt: null },
    orderBy: { scheduledAt: "asc" },
    select: { projectId: true },
  });

  const projectId = input.projectId ?? lead.projectId ?? visit?.projectId ?? null;
  const site = projectId
    ? await db.project.findUnique({
        where: { id: projectId },
        select: {
          name: true,
          addressLine: true,
          city: { select: { name: true } },
          company: {
            select: {
              name: true,
              addressLine: true,
              pincode: true,
              phone: true,
              city: { select: { name: true } },
            },
          },
        },
      })
    : null;

  const [executive, owner, creds] = await Promise.all([
    db.user.findUnique({ where: { id: input.by.id }, select: { name: true, phone: true } }),
    lead.ownerId && lead.ownerId !== input.by.id
      ? db.user.findUnique({ where: { id: lead.ownerId }, select: { phone: true } })
      : null,
    getSetting(db, "whatsapp.api"),
  ]);

  /*
   * A lead with no project at all — captured before anybody asked which tower
   * — still has an address and a number to give, as long as this organisation
   * is one company. Where there are several, there is nothing to choose
   * between them and the message says so rather than picking one.
   */
  const sole =
    site?.company ??
    (await (async () => {
      const companies = await db.company.findMany({
        where: { status: "ACTIVE" },
        select: {
          name: true,
          addressLine: true,
          pincode: true,
          phone: true,
          city: { select: { name: true } },
        },
        take: 2,
      });
      return companies.length === 1 ? companies[0] : null;
    })());

  const company = sole;
  const address =
    [site?.addressLine, site?.city?.name].filter(Boolean).join(", ") ||
    [company?.addressLine, company?.city?.name, company?.pincode].filter(Boolean).join(", ");

  const queued = await whatsappSiteVisitScheduled(db, {
    leadId: lead.id,
    client: { name: lead.name, phone: lead.phone },
    project: site?.name ?? "our project",
    address: address || "—",
    scheduledAt: input.scheduledAt,
    executive: {
      name: executive?.name ?? input.by.name,
      phone: executive?.phone || owner?.phone || company?.phone || creds.displayPhone || null,
    },
  });

  /*
   * And sent now, not on the next sweep. A client told four minutes after the
   * call has ended has been told late. `sendWhatsappNow` never throws and
   * gives up after eight seconds — the row stays queued for the sweep, so a
   * provider having a slow minute delays the message rather than failing the
   * visit.
   */
  if (queued.queued) await sendWhatsappNow(queued.id);
}
