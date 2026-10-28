import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";


import { enqueueWhatsApp, type EnqueueOutcome } from "./outbox";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * One function per event, so an action's line reads as what happened rather
 * than as a message being composed.
 *
 * The actions stay thin — a permission check, a state check, the write — and
 * everything about *who hears* and *in what words* is here, next to the other
 * eight. None of these throws: `enqueueWhatsApp` swallows, and a booking must
 * not fail because a template was renamed.
 */

const day = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const at = (d: Date | string | null | undefined): string =>
  d
    ? `${day(d)} ${new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : "—";

/**
 * The client's own confirmation of a site visit.
 *
 * The one message this platform sends on WhatsApp, and the one recipient who
 * will never open the app: where to come, when, and who will meet them.
 */
export async function whatsappSiteVisitScheduled(
  db: Db,
  input: {
    leadId: string;
    client: { name: string; phone: string | null };
    project: string;
    address: string;
    /** Null where the lead was moved to the stage without a time on it. */
    scheduledAt: Date | string | null;
    executive: { name: string; phone: string | null };
  },
): Promise<EnqueueOutcome> {
  const when = input.scheduledAt ? at(input.scheduledAt) : null;

  /*
   * Told already, for this visit?
   *
   * The same client can arrive at this message twice — a visit scheduled on
   * the form, then the card dragged to Site Visit on the board, or simply
   * dragged twice. The time is what makes it the same message, so that is
   * what is matched: a changed time is news, the same time twice is not.
   */
  if (when) {
    const told = await db.whatsappMessage.findFirst({
      where: {
        event: "SITE_VISIT_SCHEDULED",
        entity: "Lead",
        entityId: input.leadId,
        status: { in: ["QUEUED", "SCHEDULED", "SENT"] },
        variables: { array_contains: [when] },
      },
      select: { id: true },
    });
    if (told) return { queued: false, why: "This client has already been told about this visit." };
  }

  return enqueueWhatsApp(db, {
    event: "SITE_VISIT_SCHEDULED",
    toPhone: input.client.phone,
    entity: "Lead",
    entityId: input.leadId,
    // The message says when the visit is. Without a time there is nothing
    // truthful to send, and the log says so rather than staying silent.
    refuse: when ? undefined : "The lead was moved to Site Visit with no time on it.",
    values: {
      client: input.client.name,
      project: input.project,
      address: input.address,
      when: when ?? "—",
      executive: input.executive.name,
      // Their own number, so the client can reach somebody before they set off.
      executivePhone: input.executive.phone ?? "—",
    },
  });
}
