import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, tag } from "./helpers";

import { setSetting } from "@/lib/settings";
import { dispatchWhatsapp } from "@/lib/whatsapp/dispatch";
import { whatsappSiteVisitScheduled } from "@/lib/whatsapp/notify";
import { enqueueWhatsApp } from "@/lib/whatsapp/outbox";

bindCookieBox(cookieBox);

/**
 * The outbox, end to end: what gets written when an event fires, and what the
 * dispatcher does with it.
 *
 * Meta is stubbed at `fetch`, because what is being tested is this side of the
 * wire — that a refusal about the message is not retried, that their outage
 * is, and that a booking is never held open waiting for either.
 */

const suffix = tag();
const EVENT = "SITE_VISIT_SCHEDULED";
const TEMPLATE = `site_visit_scheduled_v1_${suffix}`;

let templateId: string;
let previousTrigger: { templateId: string | null; enabled: boolean; delayMinutes: number | null } | null =
  null;
const written: string[] = [];

async function connect(enabled: boolean) {
  const { userId } = await actAs("owner@nninfra.example");
  await setSetting(
    prisma,
    "whatsapp.api",
    {
      apiUrl: "https://graph.test",
      apiVersion: "v21.0",
      wabaId: "",
      phoneNumberId: "PN-TEST",
      displayPhone: "+91 90000 00000",
      accessToken: "test-token",
      enabled,
    },
    userId,
  );
}

beforeAll(async () => {
  const template = await prisma.whatsappTemplate.create({
    data: {
      name: TEMPLATE,
      languageCode: "en",
      category: "UTILITY",
      status: "APPROVED",
      variables: ["client", "project", "address", "when", "executive", "executivePhone"],
    },
    select: { id: true },
  });
  templateId = template.id;

  const existing = await prisma.whatsappTrigger.findUnique({ where: { event: EVENT } });
  previousTrigger = existing
    ? { templateId: existing.templateId, enabled: existing.enabled, delayMinutes: existing.delayMinutes }
    : null;

  await prisma.whatsappTrigger.upsert({
    where: { event: EVENT },
    create: { event: EVENT, templateId, enabled: true },
    update: { templateId, enabled: true, delayMinutes: null },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.whatsappMessage.deleteMany({ where: { templateName: TEMPLATE } });
  await prisma.whatsappMessage.deleteMany({ where: { id: { in: written } } });
  if (previousTrigger) {
    await prisma.whatsappTrigger.update({ where: { event: EVENT }, data: previousTrigger });
  } else {
    await prisma.whatsappTrigger.deleteMany({ where: { event: EVENT } });
  }
  await prisma.whatsappTemplate.deleteMany({ where: { id: templateId } });
  await cleanupActionSessions();
});

/** Meta, as far as this side can tell. */
function metaAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

const values = {
  client: "Vikram Shetty",
  project: "NN Skyline",
  address: "Sarjapur Road, Bengaluru",
  when: `28 Oct 2026 11:00 (${suffix})`,
  executive: "Priya Nair",
  executivePhone: "+91 98765 43210",
};

describe("what an event writes", () => {
  it("queues a message with the template's variables in order", async () => {
    await connect(true);
    const out = await enqueueWhatsApp(prisma, {
      event: EVENT,
      toPhone: "+91 98765 43210",
      values,
      entity: "Lead",
      entityId: `sv-${suffix}`,
    });
    expect(out.queued).toBe(true);
    if (!out.queued) return;
    written.push(out.id);

    const row = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id: out.id } });
    expect(row.status).toBe("QUEUED");
    // The number as Meta takes it, not as the record held it.
    expect(row.toPhone).toBe("919876543210");
    expect(row.variables).toEqual([
      "Vikram Shetty",
      "NN Skyline",
      "Sarjapur Road, Bengaluru",
      `28 Oct 2026 11:00 (${suffix})`,
      "Priya Nair",
      "+91 98765 43210",
    ]);
  });

  it("records a missing number rather than dropping it", async () => {
    await connect(true);
    const out = await enqueueWhatsApp(prisma, {
      event: EVENT,
      toPhone: null,
      values,
      entity: "Lead",
      entityId: `sv-none-${suffix}`,
    });
    expect(out.queued).toBe(false);

    const row = await prisma.whatsappMessage.findFirstOrThrow({
      where: { entityId: `sv-none-${suffix}` },
    });
    written.push(row.id);
    expect(row.status).toBe("SKIPPED");
    expect(row.error).toContain("no usable mobile number");
  });

  it("writes nothing at all when the trigger is off", async () => {
    await prisma.whatsappTrigger.update({ where: { event: EVENT }, data: { enabled: false } });
    const out = await enqueueWhatsApp(prisma, {
      event: EVENT,
      toPhone: "+91 98765 43210",
      values,
      entity: "Lead",
      entityId: `sv-off-${suffix}`,
    });
    expect(out.queued).toBe(false);
    expect(
      await prisma.whatsappMessage.count({ where: { entityId: `sv-off-${suffix}` } }),
      "an outbox full of rows nobody asked for buries the ones that matter",
    ).toBe(0);
    await prisma.whatsappTrigger.update({ where: { event: EVENT }, data: { enabled: true } });
  });

  it("holds a delayed trigger until its time", async () => {
    await prisma.whatsappTrigger.update({ where: { event: EVENT }, data: { delayMinutes: 30 } });
    const out = await enqueueWhatsApp(prisma, {
      event: EVENT,
      toPhone: "+91 98765 43210",
      values,
      entity: "Lead",
      entityId: `sv-later-${suffix}`,
    });
    expect(out.queued && out.scheduled).toBe(true);
    if (out.queued) written.push(out.id);

    const row = await prisma.whatsappMessage.findFirstOrThrow({
      where: { entityId: `sv-later-${suffix}` },
    });
    expect(row.status).toBe("SCHEDULED");
    expect(row.sendAfter.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    await prisma.whatsappTrigger.update({ where: { event: EVENT }, data: { delayMinutes: null } });
  });
});

describe("the client is told once, for one visit", () => {
  it("does not say the same thing twice", async () => {
    await connect(true);
    const when = new Date("2026-11-03T11:00:00+05:30");
    const lead = `lead-once-${suffix}`;

    const say = () =>
      whatsappSiteVisitScheduled(prisma, {
        leadId: lead,
        client: { name: "Vikram Shetty", phone: "+91 98765 43210" },
        project: "NN Skyline",
        address: "Sarjapur Road, Bengaluru",
        scheduledAt: when,
        executive: { name: "Priya Nair", phone: "+91 90000 00000" },
      });

    // Scheduled on the form, then the card dragged to Site Visit: one visit,
    // one message.
    await say();
    await say();

    const rows = await prisma.whatsappMessage.findMany({ where: { entityId: lead } });
    written.push(...rows.map((r) => r.id));
    expect(rows).toHaveLength(1);
  });

  it("says it again when the time changes", async () => {
    await connect(true);
    const lead = `lead-moved-${suffix}`;
    const client = { name: "Vikram Shetty", phone: "+91 98765 43210" };
    const executive = { name: "Priya Nair", phone: "+91 90000 00000" };

    for (const when of [new Date("2026-11-03T11:00:00+05:30"), new Date("2026-11-04T16:00:00+05:30")]) {
      await whatsappSiteVisitScheduled(prisma, {
        leadId: lead,
        client,
        project: "NN Skyline",
        address: "Sarjapur Road, Bengaluru",
        scheduledAt: when,
        executive,
      });
    }

    const rows = await prisma.whatsappMessage.findMany({ where: { entityId: lead } });
    written.push(...rows.map((r) => r.id));
    expect(rows, "a moved visit is news; the same one twice is not").toHaveLength(2);
  });

  /*
   * Dragging a card to Site Visit captures no time. A confirmation that
   * cannot name one is not a confirmation, so nothing is sent — and the log
   * says why, rather than leaving somebody waiting for a message that was
   * never coming.
   */
  it("sends nothing, visibly, when no time is set", async () => {
    await connect(true);
    const lead = `lead-notime-${suffix}`;
    await whatsappSiteVisitScheduled(prisma, {
      leadId: lead,
      client: { name: "Vikram Shetty", phone: "+91 98765 43210" },
      project: "NN Skyline",
      address: "Sarjapur Road, Bengaluru",
      scheduledAt: null,
      executive: { name: "Priya Nair", phone: null },
    });

    const row = await prisma.whatsappMessage.findFirstOrThrow({ where: { entityId: lead } });
    written.push(row.id);
    expect(row.status).toBe("SKIPPED");
    expect(row.error).toContain("no time");
  });
});

describe("what the dispatcher does with it", () => {
  async function queueOne(key: string) {
    await connect(true);
    const out = await enqueueWhatsApp(prisma, {
      event: EVENT,
      toPhone: "+91 98765 43210",
      values,
      entity: "Lead",
      entityId: key,
    });
    if (!out.queued) throw new Error("not queued");
    written.push(out.id);
    return out.id;
  }

  it("sends it, and keeps Meta's message id", async () => {
    const id = await queueOne(`sv-send-${suffix}`);
    metaAnswers(200, { messages: [{ id: "wamid.TEST123" }] });

    const result = await dispatchWhatsapp();
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const row = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("SENT");
    expect(row.metaMessageId).toBe("wamid.TEST123");
    expect(row.sentAt).not.toBeNull();
  });

  it("gives up on a refusal about the message, in Meta's own words", async () => {
    const id = await queueOne(`sv-refused-${suffix}`);
    metaAnswers(400, { error: { message: "Template name does not exist in the translation" } });

    await dispatchWhatsapp();

    const row = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.error).toContain("does not exist");
  });

  it("tries again on their outage, later", async () => {
    const id = await queueOne(`sv-outage-${suffix}`);
    metaAnswers(503, { error: { message: "Service temporarily unavailable" } });

    await dispatchWhatsapp();

    const row = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("QUEUED");
    expect(row.attempts).toBe(1);
    // Not now: two minutes from now.
    expect(row.sendAfter.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("sends nothing at all while the connection is switched off", async () => {
    const id = await queueOne(`sv-offline-${suffix}`);
    await connect(false);
    metaAnswers(200, { messages: [{ id: "wamid.NOPE" }] });

    const result = await dispatchWhatsapp();
    expect(result.skipped).toContain("switched off");
    expect(result.sent).toBe(0);

    // And the message is untouched, waiting for the connection to come back.
    const row = await prisma.whatsappMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("QUEUED");
    expect(row.attempts).toBe(0);
    await connect(true);
  });
});
