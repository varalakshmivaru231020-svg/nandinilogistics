import "server-only";

import { prisma } from "@/lib/db";

import { WHATSAPP_EVENTS, whatsappEventsByModule, type WhatsappEventDef } from "./events";
import { whatsappSettingsForScreen } from "./client";

/**
 * What the Masters → WhatsApp section is drawn from.
 *
 * The rows for the nine events are created here if they are missing, so the
 * screen is never empty on a fresh database and an administrator never has to
 * press "set up" before they can switch anything on. It writes only what is
 * absent, so it is safe on every load.
 */

export interface TriggerRow {
  event: WhatsappEventDef;
  templateId: string | null;
  templateName: string | null;
  templateStatus: string | null;
  enabled: boolean;
  delayMinutes: number | null;
  fallbackPhone: string | null;
  /** Sent, failed and skipped under this event, for the screen's own count. */
  sent: number;
  failed: number;
  queued: number;
}

export async function ensureWhatsappRows(): Promise<void> {
  /*
   * A row per template the events name, so the dropdown has something in it
   * before anybody presses "read templates from Meta" — and so the screen can
   * say *pending* rather than showing nothing at all while approval is
   * waited on. What Meta says later overwrites the status; the variables are
   * ours either way, because position is what the send reads.
   */
  const wanted = new Map<string, (typeof WHATSAPP_EVENTS)[number]>();
  for (const event of WHATSAPP_EVENTS) wanted.set(event.template, event);

  const existing = await prisma.whatsappTemplate.findMany({
    where: { name: { in: [...wanted.keys()] } },
    select: { name: true },
  });
  const held = new Set(existing.map((t) => t.name));

  for (const [name, event] of wanted) {
    if (held.has(name)) continue;
    await prisma.whatsappTemplate.create({
      data: {
        name,
        languageCode: "en",
        category: "UTILITY",
        variables: event.variables.slice(),
        buttonVariables: event.button ? [event.button] : [],
        status: "PENDING",
      },
    });
  }

  const have = await prisma.whatsappTrigger.findMany({ select: { event: true } });
  const haveEvents = new Set(have.map((t) => t.event));
  const missing = WHATSAPP_EVENTS.filter((e) => !haveEvents.has(e.key));
  if (missing.length === 0) return;

  await prisma.whatsappTrigger.createMany({
    data: missing.map((e) => ({ event: e.key, enabled: false })),
    skipDuplicates: true,
  });
}

export async function whatsappConsole() {
  await ensureWhatsappRows();

  const [settings, templates, triggers, counts, recent] = await Promise.all([
    whatsappSettingsForScreen(),
    prisma.whatsappTemplate.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, languageCode: true, status: true, category: true, bodyText: true },
    }),
    prisma.whatsappTrigger.findMany({
      include: { template: { select: { id: true, name: true, status: true } } },
    }),
    prisma.whatsappMessage.groupBy({ by: ["event", "status"], _count: { _all: true } }),
    prisma.whatsappMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        toPhone: true,
        templateName: true,
        event: true,
        status: true,
        error: true,
        attempts: true,
        sentAt: true,
        createdAt: true,
      },
    }),
  ]);

  const byEvent = new Map(triggers.map((t) => [t.event, t]));
  const tally = (event: string, status: string) =>
    counts.find((c) => c.event === event && c.status === status)?._count._all ?? 0;

  const rows: TriggerRow[] = WHATSAPP_EVENTS.map((event) => {
    const row = byEvent.get(event.key);
    return {
      event,
      templateId: row?.templateId ?? null,
      templateName: row?.template?.name ?? null,
      templateStatus: row?.template?.status ?? null,
      enabled: row?.enabled ?? false,
      delayMinutes: row?.delayMinutes ?? null,
      fallbackPhone: row?.fallbackPhone ?? null,
      sent: tally(event.key, "SENT"),
      failed: tally(event.key, "FAILED") + tally(event.key, "SKIPPED"),
      queued: tally(event.key, "QUEUED") + tally(event.key, "SCHEDULED"),
    };
  });

  return {
    settings,
    templates,
    rows,
    groups: whatsappEventsByModule(),
    recent,
    /** What the outbox holds right now, for the line above the log. */
    waiting: rows.reduce((n, r) => n + r.queued, 0),
  };
}

export type WhatsappConsole = Awaited<ReturnType<typeof whatsappConsole>>;
