import "server-only";

import { prisma } from "@/lib/db";

import { sendTemplate, WhatsappError, whatsappCreds, configurationProblem } from "./client";
import { MAX_ATTEMPTS, retryDelayMinutes, worthRetrying } from "./outbox";

/**
 * Draining the outbox.
 *
 * Run on a schedule — `/api/whatsapp/dispatch`, from cron, the way the nightly
 * backup runs. There is no queue server here and nothing that needs one: the
 * outbox *is* the queue, Postgres is the lock, and a run that dies halfway
 * leaves every unsent row exactly where it was.
 *
 * One message at a time, deliberately. The volume is tens a day, not
 * thousands, and a sequential run is one thing to read in the log when
 * somebody asks why a vendor was not told.
 */

export interface DispatchResult {
  considered: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: string | null;
}

/** Sends everything that is due. Returns what it did, for the log. */
export async function dispatchWhatsapp(limit = 50): Promise<DispatchResult> {
  const result: DispatchResult = { considered: 0, sent: 0, failed: 0, retried: 0, skipped: null };

  const creds = await whatsappCreds();
  const problem = configurationProblem(creds);
  if (problem) {
    // Nothing is marked failed for this: the messages are fine, the
    // connection is not, and they should go out when it is fixed.
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
    const attempts = message.attempts + 1;
    try {
      const sent = await sendTemplate({
        toPhone: message.toPhone,
        templateName: message.templateName,
        languageCode: message.languageCode,
        variables: (message.variables as string[]) ?? [],
        buttonVariables:
          (message.buttonVariables as Array<{ index: number; value: string }>) ?? [],
      });
      await prisma.whatsappMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          attempts,
          error: null,
          metaMessageId: sent.messages?.[0]?.id ?? null,
        },
      });
      result.sent += 1;
    } catch (err) {
      const status = err instanceof WhatsappError ? err.status : 0;
      const reason = err instanceof Error ? err.message : String(err);
      const again = worthRetrying(status) && attempts < MAX_ATTEMPTS;

      await prisma.whatsappMessage.update({
        where: { id: message.id },
        data: {
          attempts,
          error: reason.slice(0, 500),
          ...(again
            ? {
                status: "QUEUED",
                sendAfter: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000),
              }
            : { status: "FAILED" }),
        },
      });
      if (again) result.retried += 1;
      else result.failed += 1;
    }
  }

  return result;
}
