import "server-only";

import type { WhatsappMessage } from "@prisma/client";

import { prisma } from "@/lib/db";

import { sendTemplate, WhatsappError, whatsappCreds, configurationProblem } from "./client";
import { MAX_ATTEMPTS, retryDelayMinutes, worthRetrying } from "./outbox";

/**
 * Getting what is in the outbox out of it.
 *
 * Two ways in, and they do the same thing to a row:
 *
 *   - **`sendWhatsappNow()`**, the moment the event happens, so a client gets
 *     their confirmation while the person who scheduled it is still looking at
 *     the screen. On a short deadline, because a provider having a slow minute
 *     must not hold up the booking of a site visit.
 *   - **`dispatchWhatsapp()`**, from cron, which sweeps up everything the
 *     first way did not get: a send that timed out, one the provider refused
 *     with a 5xx, and anything queued while the connection was switched off.
 *
 * There is no queue server here and nothing needs one: the outbox is the
 * queue, Postgres is the lock, and a run that dies halfway leaves every unsent
 * row exactly where it was.
 */

export interface DispatchResult {
  considered: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: string | null;
}

/** What happened to one message, in words a screen can show. */
export type SendOutcome =
  | { sent: true; metaMessageId: string | null }
  | { sent: false; why: string; willRetry: boolean };

/**
 * Sends one row and writes back what happened.
 *
 * A refusal about the message itself — template not approved, number not on
 * WhatsApp, a parameter Meta will not take — is final: the same send will be
 * refused the same way in two minutes. Their outage, their rate limit, or
 * never reaching them at all is tried again, further off each time.
 */
async function attempt(message: WhatsappMessage, timeoutMs?: number): Promise<SendOutcome> {
  const attempts = message.attempts + 1;
  try {
    const sent = await sendTemplate(
      {
        toPhone: message.toPhone,
        templateName: message.templateName,
        languageCode: message.languageCode,
        variables: (message.variables as string[]) ?? [],
        buttonVariables: (message.buttonVariables as Array<{ index: number; value: string }>) ?? [],
      },
      timeoutMs,
    );
    const metaMessageId = sent.messages?.[0]?.id ?? null;
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: "SENT", sentAt: new Date(), attempts, error: null, metaMessageId },
    });
    return { sent: true, metaMessageId };
  } catch (err) {
    const status = err instanceof WhatsappError ? err.status : 0;
    const why = err instanceof Error ? err.message : String(err);
    const willRetry = worthRetrying(status) && attempts < MAX_ATTEMPTS;

    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: {
        attempts,
        error: why.slice(0, 500),
        ...(willRetry
          ? {
              status: "QUEUED",
              sendAfter: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000),
            }
          : { status: "FAILED" }),
      },
    });
    return { sent: false, why, willRetry };
  }
}

/**
 * Sends one message straight away, by id.
 *
 * Used from the action that raised it and from the Send again button. It
 * never throws: the row is the record, and a site visit must be booked
 * whatever WhatsApp is doing.
 */
export async function sendWhatsappNow(id: string, timeoutMs = 8_000): Promise<SendOutcome> {
  try {
    const creds = await whatsappCreds();
    const problem = configurationProblem(creds);
    // Left queued, untouched, for when the connection is put right.
    if (problem) return { sent: false, why: problem, willRetry: true };

    const message = await prisma.whatsappMessage.findUnique({ where: { id } });
    if (!message) return { sent: false, why: "That message is no longer there.", willRetry: false };
    if (message.status === "SENT") {
      return { sent: true, metaMessageId: message.metaMessageId };
    }
    return await attempt(message, timeoutMs);
  } catch (err) {
    return { sent: false, why: String(err), willRetry: true };
  }
}

/** Sends everything that is due. Returns what it did, for the log. */
export async function dispatchWhatsapp(limit = 50): Promise<DispatchResult> {
  const result: DispatchResult = { considered: 0, sent: 0, failed: 0, retried: 0, skipped: null };

  const creds = await whatsappCreds();
  const problem = configurationProblem(creds);
  if (problem) {
    // Nothing is marked failed for this: the messages are fine, the
    // connection is not, and they should go out when it is put right.
    result.skipped = problem;
    return result;
  }

  const due = await prisma.whatsappMessage.findMany({
    where: { status: { in: ["QUEUED", "SCHEDULED"] }, sendAfter: { lte: new Date() } },
    orderBy: { sendAfter: "asc" },
    take: limit,
  });
  result.considered = due.length;

  for (const message of due) {
    const outcome = await attempt(message);
    if (outcome.sent) result.sent += 1;
    else if (outcome.willRetry) result.retried += 1;
    else result.failed += 1;
  }

  return result;
}
