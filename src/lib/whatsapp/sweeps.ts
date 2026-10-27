import "server-only";

import { prisma } from "@/lib/db";

import { whatsappHoldExpiring } from "./notify";

/**
 * The time-based triggers: the ones nobody's click causes.
 *
 * A hold lapsing is the clearest case — nothing happens, which is exactly the
 * problem. The flat goes back on the board and whoever was holding it finds
 * out when somebody else books it.
 */

/** How long before a hold lapses the warning goes out. */
export const HOLD_WARNING_HOURS = 6;

export interface SweptHolds {
  checked: number;
  warned: number;
}

/**
 * Warns about every hold inside the warning window, once each.
 *
 * "Once each" is the whole difficulty: this runs every few minutes, and a hold
 * sits inside its window for hours. The outbox is the record of what has been
 * said, so a hold that already has a message for this lapse is skipped — no
 * extra column, and no second source of truth about what went out.
 */
export async function sweepExpiringHolds(now: Date = new Date()): Promise<SweptHolds> {
  const until = new Date(now.getTime() + HOLD_WARNING_HOURS * 3_600_000);

  const holds = await prisma.unitHold.findMany({
    where: {
      isActive: true,
      releasedAt: null,
      expiresAt: { gt: now, lte: until },
    },
    select: {
      id: true,
      unitId: true,
      expiresAt: true,
      heldBy: { select: { id: true, name: true, phone: true } },
      customer: { select: { name: true } },
      lead: { select: { name: true } },
      unit: {
        select: { unitNumber: true, project: { select: { name: true } } },
      },
    },
    take: 200,
  });

  let warned = 0;
  for (const hold of holds) {
    /*
     * Told already? The message carries the hold's own id, so an extension —
     * which is a new `expiresAt` on the same hold — would not be warned about
     * again. That is deliberate: a hold extended by a day is not news, and the
     * person who extended it is the person who would be told.
     */
    const told = await prisma.whatsappMessage.findFirst({
      where: { event: "UNIT_HOLD_EXPIRING", entity: "UnitHold", entityId: hold.id },
      select: { id: true },
    });
    if (told) continue;

    await whatsappHoldExpiring(prisma, {
      holdId: hold.id,
      unitId: hold.unitId,
      flat: hold.unit?.unitNumber ?? "—",
      project: hold.unit?.project?.name ?? "—",
      heldFor: hold.customer?.name ?? hold.lead?.name ?? "somebody",
      expiresAt: hold.expiresAt,
      executive: hold.heldBy,
    });
    warned += 1;
  }

  return { checked: holds.length, warned };
}
