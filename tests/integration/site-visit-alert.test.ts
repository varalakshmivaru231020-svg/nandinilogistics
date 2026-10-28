import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

import { scheduleSiteVisitAction } from "@/app/(app)/sales/site-visits/actions";
import { changeLeadStageAction, logFollowUpAction } from "@/app/(app)/sales/leads/actions";
import { seedWhatsapp } from "../../prisma/whatsapp-seed";

bindCookieBox(cookieBox);

/**
 * The alert, from the actions a salesperson actually presses.
 *
 * `whatsapp-outbox.test.ts` proves the outbox and the dispatcher; this proves
 * the wiring into the three places that raise the event — the schedule form,
 * the board, and a follow-up logged as a site visit — with a lead created for
 * it and taken away afterwards. Without this, all three could be disconnected
 * and every other test would still pass.
 */
describe("a site visit tells the client", () => {
  const suffix = tag();
  const CLIENT = `Seed Client ${suffix}`;
  let leadId = "";
  let projectId = "";
  let templateId = "";
  let previous: { templateId: string | null; enabled: boolean } | null = null;

  beforeAll(async () => {
    await actAs("owner@nninfra.example");

    // The configuration a deployed environment gets, run here too.
    await seedWhatsapp(prisma);
    const template = await prisma.whatsappTemplate.findFirstOrThrow({
      where: { name: "site_visit_conformatioon" },
      select: { id: true },
    });
    templateId = template.id;

    const trigger = await prisma.whatsappTrigger.findUnique({
      where: { event: "SITE_VISIT_SCHEDULED" },
      select: { templateId: true, enabled: true },
    });
    previous = trigger ?? null;

    // Meta has approved it on production; here it is said so, and switched on.
    await prisma.whatsappTemplate.update({
      where: { id: templateId },
      data: { status: "APPROVED" },
    });
    await prisma.whatsappTrigger.update({
      where: { event: "SITE_VISIT_SCHEDULED" },
      data: { templateId, enabled: true },
    });

    const project = await prisma.project.findFirstOrThrow({
      where: { code: "NNS" },
      select: { id: true },
    });
    projectId = project.id;

    const source = await prisma.leadSource.findFirstOrThrow({ select: { id: true } });
    const owner = await prisma.user.findFirstOrThrow({
      where: { email: "owner@nninfra.example" },
      select: { id: true },
    });
    const lead = await prisma.lead.create({
      data: {
        leadNo: `LEAD-SEED-${suffix}`,
        name: CLIENT,
        phone: "+91 98765 43210",
        sourceId: source.id,
        ownerId: owner.id,
        projectId,
        state: "NEW",
      },
      select: { id: true },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    await prisma.whatsappMessage.deleteMany({ where: { entityId: leadId } });
    await prisma.siteVisit.deleteMany({ where: { leadId } });
    await prisma.leadFollowUp.deleteMany({ where: { leadId } });
    await prisma.lead.deleteMany({ where: { id: leadId } });
    if (previous) {
      await prisma.whatsappTrigger.update({
        where: { event: "SITE_VISIT_SCHEDULED" },
        data: previous,
      });
    }
    await prisma.whatsappTemplate.updateMany({
      where: { id: templateId },
      data: { status: "PENDING" },
    });
    await cleanupActionSessions();
  });

  /*
   * The provider, as far as this side can tell. A real send would message a
   * real phone, which a test must never do.
   */
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

  it("sends it at once, rather than waiting for the sweep", async () => {
    metaAnswers(200, { messages: [{ id: "wamid.SEEDED" }] });
    const when = new Date(Date.now() + 5 * 86_400_000);

    const res = await scheduleSiteVisitAction(leadId, when.toISOString(), projectId);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    // Sent by the time the action returned: the person who scheduled it is
    // still on the screen, and the client already has the message.
    const message = await prisma.whatsappMessage.findFirstOrThrow({
      where: { entityId: leadId },
      orderBy: { createdAt: "desc" },
    });
    expect(message.status).toBe("SENT");
    expect(message.metaMessageId).toBe("wamid.SEEDED");
    expect(message.sentAt).not.toBeNull();

    vi.unstubAllGlobals();
    await prisma.whatsappMessage.deleteMany({ where: { entityId: leadId } });
    await prisma.siteVisit.deleteMany({ where: { leadId } });
  });

  it("leaves it queued for the sweep when the provider is having a bad minute", async () => {
    metaAnswers(503, { error: { message: "Service temporarily unavailable" } });
    const when = new Date(Date.now() + 6 * 86_400_000);

    const res = await scheduleSiteVisitAction(leadId, when.toISOString(), projectId);
    // The visit is booked regardless. That is the whole point of the outbox.
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    const message = await prisma.whatsappMessage.findFirstOrThrow({
      where: { entityId: leadId },
      orderBy: { createdAt: "desc" },
    });
    expect(message.status).toBe("QUEUED");
    expect(message.attempts).toBe(1);
    expect(message.error).toContain("temporarily unavailable");

    vi.unstubAllGlobals();
    await prisma.whatsappMessage.deleteMany({ where: { entityId: leadId } });
    await prisma.siteVisit.deleteMany({ where: { leadId } });
  });

  it("queues the confirmation when the visit is scheduled", async () => {
    const when = new Date(Date.now() + 3 * 86_400_000);
    const res = await scheduleSiteVisitAction(leadId, when.toISOString(), projectId);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    const message = await prisma.whatsappMessage.findFirstOrThrow({
      where: { entityId: leadId, event: "SITE_VISIT_SCHEDULED" },
    });

    expect(message.status).toBe("QUEUED");
    expect(message.templateName).toBe("site_visit_conformatioon");
    // The number as Meta takes it, not as the lead held it.
    expect(message.toPhone).toBe("919876543210");

    const variables = message.variables as string[];
    expect(variables).toHaveLength(6);
    expect(variables[0]).toBe(CLIENT);
    // The project and its address, so the client knows where to come.
    expect(variables[1].length).toBeGreaterThan(0);
    expect(variables[3]).toMatch(/\d{2} \w{3} \d{4}/);
    // Whoever scheduled it, and a number to reach them on.
    expect(variables[4].length).toBeGreaterThan(0);
  });

  it("says nothing further when the card is then dragged to Site Visit", async () => {
    const before = await prisma.whatsappMessage.count({ where: { entityId: leadId } });

    const res = await changeLeadStageAction(leadId, "SITE_VISIT_SCHEDULED");
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    // One visit, one message: the board and the form are the same event.
    const after = await prisma.whatsappMessage.count({ where: { entityId: leadId } });
    expect(after).toBe(before);
  });

  /*
   * The visit is usually arranged on the call, and what the executive does on
   * the call is log a follow-up. Waiting for the card to be dragged afterwards
   * is waiting for a step nobody owes anybody.
   */
  describe("a follow-up logged as a site visit", () => {
    const FOLLOW_UP_DAY = "2026-12-18";

    beforeAll(async () => {
      await prisma.whatsappMessage.deleteMany({ where: { entityId: leadId } });
      await prisma.siteVisit.deleteMany({ where: { leadId } });
      await prisma.leadFollowUp.deleteMany({ where: { leadId } });
    });

    it("tells the client at once, with the date typed on the follow-up", async () => {
      metaAnswers(200, { messages: [{ id: "wamid.FOLLOWUP" }] });

      const res = await logFollowUpAction(
        leadId,
        "SITE_VISIT",
        "Agreed to come and see the 3 BHK",
        "Interested",
        FOLLOW_UP_DAY,
      );
      expect(res.ok, res.ok ? "" : res.error).toBe(true);

      const message = await prisma.whatsappMessage.findFirstOrThrow({
        where: { entityId: leadId, event: "SITE_VISIT_SCHEDULED" },
        orderBy: { createdAt: "desc" },
      });
      // Sent, not merely queued: the client hears while the call is still warm.
      expect(message.status).toBe("SENT");
      expect(message.metaMessageId).toBe("wamid.FOLLOWUP");

      const variables = message.variables as string[];
      expect(variables[0]).toBe(CLIENT);
      // The day as typed, and no midnight: these screens log a date, not a time.
      expect(variables[3]).toBe("18 Dec 2026");

      vi.unstubAllGlobals();
    });

    it("is not sent twice when the card is dragged over afterwards", async () => {
      const before = await prisma.whatsappMessage.count({ where: { entityId: leadId } });

      const res = await changeLeadStageAction(leadId, "SITE_VISIT_SCHEDULED");
      expect(res.ok, res.ok ? "" : res.error).toBe(true);

      // The stage move reads the same next action and finds it already told.
      const after = await prisma.whatsappMessage.count({ where: { entityId: leadId } });
      expect(after).toBe(before);
    });

    it("says nothing for a follow-up that is not a site visit", async () => {
      const before = await prisma.whatsappMessage.count({ where: { entityId: leadId } });

      const res = await logFollowUpAction(leadId, "CALL", "Not reachable", "", "2026-12-20");
      expect(res.ok, res.ok ? "" : res.error).toBe(true);

      const after = await prisma.whatsappMessage.count({ where: { entityId: leadId } });
      expect(after).toBe(before);
    });
  });
});
