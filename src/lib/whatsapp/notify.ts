import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";


import { enqueueWhatsApp } from "./outbox";

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
    scheduledAt: Date | string;
    executive: { name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "SITE_VISIT_SCHEDULED",
    toPhone: input.client.phone,
    entity: "Lead",
    entityId: input.leadId,
    values: {
      client: input.client.name,
      project: input.project,
      address: input.address,
      when: at(input.scheduledAt),
      executive: input.executive.name,
      // Their own number, so the client can reach somebody before they set off.
      executivePhone: input.executive.phone ?? "—",
    },
  });
}
