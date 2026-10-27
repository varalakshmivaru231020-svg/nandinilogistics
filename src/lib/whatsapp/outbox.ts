import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { isSendable, normalisePhone } from "./phone";
import { orderedVariables, tidy, whatsappEvent, type WhatsappEventKey } from "./events";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Writing a message into the outbox, and deciding whether there is one to
 * write at all.
 *
 * Nothing here sends: the dispatcher does that, on its own run, so a booking
 * is never held open while Meta is slow and never rolled back because Meta
 * was down. The business flow's only job is to say what happened.
 *
 * `enqueueWhatsApp()` never throws. A message that cannot be queued is a
 * message not sent; a receipt that cannot be recorded is money lost, and the
 * two must not be able to take each other down.
 */

export interface EnqueueInput {
  event: WhatsappEventKey | string;
  /** The number, in whatever shape the record holds it. */
  toPhone: string | null | undefined;
  /** The template's variables, by name — order is the registry's business. */
  values: Record<string, string | number | null | undefined>;
  /** What the url button points at, as a path: `tasks/<id>`. */
  href?: string;
  /** What it is about, so a record can show its own messages. */
  entity?: string;
  entityId?: string;
  /** Who it is about, where they are a user here. */
  userId?: string;
  /**
   * Do not send, and say why on the log.
   *
   * For the case where the event happened but the message cannot be written
   * truthfully — a site visit moved on the board with no time on it. Silence
   * would leave somebody waiting for a message that was never coming; a row
   * saying why is something an administrator can act on.
   */
  refuse?: string;
}

export type EnqueueOutcome =
  | { queued: true; id: string; scheduled: boolean }
  | { queued: false; why: string };

/**
 * Queues one message, or says why it did not.
 *
 * The reasons it does not are all ordinary:
 *
 *   - the event is switched off, or has no template mapped — the administrator
 *     has not turned it on, and an outbox full of rows nobody asked for would
 *     bury the ones that matter, so nothing is written;
 *   - there is no usable number — written as SKIPPED, because that one *is* a
 *     fault worth seeing on the screen: somebody's record is missing a mobile.
 */
export async function enqueueWhatsApp(db: Db, input: EnqueueInput): Promise<EnqueueOutcome> {
  try {
    const def = whatsappEvent(input.event);
    if (!def) return { queued: false, why: `No such WhatsApp event: ${input.event}` };

    const trigger = await db.whatsappTrigger.findUnique({
      where: { event: def.key },
      include: { template: true },
    });
    if (!trigger?.enabled) return { queued: false, why: "This trigger is switched off." };

    const template = trigger.template;
    if (!template || !template.enabled) {
      return { queued: false, why: "No template is mapped to this trigger." };
    }

    const toPhone = normalisePhone(input.toPhone) || normalisePhone(trigger.fallbackPhone);
    const variables = orderedVariables(def, input.values);
    const buttons =
      def.button && input.href ? [{ index: def.button.index, value: tidy(input.href) }] : [];

    const common = {
      templateName: template.name,
      languageCode: template.languageCode,
      templateId: template.id,
      variables,
      buttonVariables: buttons,
      event: def.key,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      userId: input.userId ?? null,
    };

    if (input.refuse) {
      const row = await db.whatsappMessage.create({
        data: { ...common, toPhone: toPhone || "", status: "SKIPPED", error: input.refuse },
        select: { id: true },
      });
      return { queued: false, why: `${input.refuse} (${row.id})` };
    }

    if (!isSendable(toPhone)) {
      // Recorded rather than dropped: "nobody was told" is the thing an
      // administrator needs to see, and the missing number is the fix.
      const row = await db.whatsappMessage.create({
        data: {
          ...common,
          toPhone: toPhone || "",
          status: "SKIPPED",
          error: "There is no usable mobile number on the record.",
        },
        select: { id: true },
      });
      return { queued: false, why: `No number: ${row.id}` };
    }

    const delay = trigger.delayMinutes ?? 0;
    const sendAfter = new Date(Date.now() + Math.max(0, delay) * 60_000);
    const row = await db.whatsappMessage.create({
      data: {
        ...common,
        toPhone,
        status: delay > 0 ? "SCHEDULED" : "QUEUED",
        sendAfter,
      },
      select: { id: true },
    });
    return { queued: true, id: row.id, scheduled: delay > 0 };
  } catch (err) {
    /*
     * Swallowed on purpose. This is called from inside the actions that book
     * flats and record money; a WhatsApp table that is missing, locked or slow
     * must not roll any of that back.
     */
    console.error("[whatsapp] could not queue", input.event, err);
    return { queued: false, why: String(err) };
  }
}

/** How many times a message is tried before it is left alone. */
export const MAX_ATTEMPTS = 4;

/**
 * How long to wait before trying again, in minutes: 2, 8, 32.
 *
 * A refusal is usually permanent — a template not approved, a number not on
 * WhatsApp — and retrying it faster would only spend the quota sooner. This
 * backs off far enough that a real outage is ridden out in under an hour.
 */
export function retryDelayMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1);
}

/**
 * Whether a refusal is worth trying again.
 *
 * Meta's 4xx are about the message — this template, this number, these
 * parameters — and will say the same thing next time. A 429 is the quota and a
 * 5xx is theirs, both of which pass.
 */
export function worthRetrying(status: number): boolean {
  if (status === 0) return true; // never reached them
  if (status === 429) return true;
  return status >= 500;
}
