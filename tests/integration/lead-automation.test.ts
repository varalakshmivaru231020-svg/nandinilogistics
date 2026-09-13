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

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, cleanupActionSessions, bindCookieBox } from "./action-harness";
import { prisma, tag } from "./helpers";

import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { getSetting } from "@/lib/settings";
import { chooseLeadOwner, escalateOverdueFollowUps, recordFirstResponse } from "@/lib/sales/lead-service";

import * as leads from "@/app/(app)/sales/leads/actions";
import * as settings from "@/app/(app)/admin/settings/actions";
import * as inbox from "@/app/(app)/notifications/actions";

bindCookieBox(cookieBox);

const HOUR = 3_600_000;
const MIN = 60_000;

/**
 * Lead auto-assignment, response time and follow-up escalation, end to end.
 *
 * The assignment rule is exercised through chooseLeadOwner with an explicit
 * mode, never by switching the organisation's setting: that setting is global,
 * and other test files creating leads in parallel expect the default. The
 * escalation setting is only ever changed here and is restored afterwards.
 */
describe("lead automation", () => {
  const S = tag().toUpperCase();
  const createdLeads: string[] = [];
  const createdProjects: string[] = [];

  let ownerId: string;
  let salesId: string;
  let headId: string;
  let temp: { id: string };
  let sourceId: string;
  let escalationBefore: { value: unknown } | null;

  async function lead(over: Record<string, unknown> = {}) {
    const row = await prisma.lead.create({
      data: {
        leadNo: `LA-${S}-${createdLeads.length}`,
        name: `Automation test ${createdLeads.length}`,
        phone: `90000${String(createdLeads.length).padStart(5, "0")}`,
        sourceId,
        ownerId: salesId,
        assignedAt: new Date(),
        ...over,
      },
    });
    createdLeads.push(row.id);
    return row;
  }
  const reload = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

  async function project(label: string) {
    const type = await prisma.projectType.findFirstOrThrow();
    const p = await prisma.project.create({
      data: { code: `LA-${S}-${label}`, name: `Automation ${label}`, projectTypeId: type.id },
    });
    createdProjects.push(p.id);
    return p.id;
  }

  beforeAll(async () => {
    const byEmail = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    ownerId = await byEmail("owner@nninfra.example");
    salesId = await byEmail("sales@nninfra.example");
    headId = await byEmail("saleshead@nninfra.example");
    sourceId = (await prisma.leadSource.findFirstOrThrow()).id;

    // Clear anything a previous, interrupted run left behind.
    const stale = await prisma.user.findMany({ where: { email: { startsWith: "lead-auto-" } }, select: { id: true } });
    if (stale.length) {
      const ids = stale.map((u) => u.id);
      await prisma.lead.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.userProject.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    // A second sales executive, so round-robin has a real choice to make.
    const salesRole = await prisma.role.findUniqueOrThrow({ where: { code: "SALES" } });
    temp = await prisma.user.create({
      data: {
        employeeCode: `LA-${S}`,
        name: `Round Robin ${S}`,
        email: `lead-auto-${S.toLowerCase()}@nninfra.example`,
        passwordHash: "not-a-real-hash",
        status: "ACTIVE",
      },
    });
    await prisma.userRole.create({ data: { userId: temp.id, roleId: salesRole.id } });

    escalationBefore = await prisma.appSetting.findUnique({ where: { key: "sales.followUpEscalation" } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { entityId: { in: createdLeads } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeads } } });
    await prisma.lead.deleteMany({ where: { ownerId: temp.id } });
    await prisma.userProject.deleteMany({ where: { userId: temp.id } });
    await prisma.userRole.deleteMany({ where: { userId: temp.id } });
    await prisma.user.delete({ where: { id: temp.id } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: { in: createdProjects } } });

    if (escalationBefore) {
      await prisma.appSetting.update({
        where: { key: "sales.followUpEscalation" },
        data: { value: escalationBefore.value as never },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: "sales.followUpEscalation" } });
    }

    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  /* ------------------------------ The duties ------------------------------ */

  describe("who holds the duties", () => {
    it("hands new leads to sales executives — not the owner, not the sales head", async () => {
      const pool = await usersHolding(prisma, PERM.sales.lead.receiveAssignment);
      expect(pool).toContain(salesId);
      expect(pool).toContain(temp.id);
      expect(pool).not.toContain(ownerId);
      expect(pool).not.toContain(headId);
    });

    it("tells the sales head about lapses — not the owner, and not the executives", async () => {
      const recipients = await usersHolding(prisma, PERM.sales.followUp.receiveEscalation);
      expect(recipients).toContain(headId);
      expect(recipients).not.toContain(ownerId);
      // Being told your own follow-up has lapsed is not an escalation.
      expect(recipients).not.toContain(salesId);
      expect(recipients).not.toContain(temp.id);
    });

    it("never gives both duties to the same person", async () => {
      // A wildcard such as sales.followUp.* grants every follow-up permission at
      // once, this duty included. So the rule is checked on the people who end
      // up holding the duties, rather than trusted to each role's grant list.
      const [assignees, escalated] = await Promise.all([
        usersHolding(prisma, PERM.sales.lead.receiveAssignment),
        usersHolding(prisma, PERM.sales.followUp.receiveEscalation),
      ]);
      expect(assignees.filter((id) => escalated.includes(id))).toEqual([]);
    });
  });

  /* ------------------------------ Assignment ------------------------------ */

  describe("choosing who owns a new lead", () => {
    it("leaves it with whoever captured it in manual mode", async () => {
      expect(await chooseLeadOwner(prisma, "MANUAL", null, ownerId)).toEqual({ ownerId, auto: false });
    });

    it("round-robin gives it to someone never assigned before anyone else", async () => {
      expect(await chooseLeadOwner(prisma, "ROUND_ROBIN", null, ownerId)).toEqual({ ownerId: temp.id, auto: true });
    });

    it("round-robin moves on once that person has been given one", async () => {
      // Dated ahead, so a lead given to anyone else during this run cannot make
      // this person look less recent than they are.
      await lead({ ownerId: temp.id, assignedAt: new Date(Date.now() + 365 * 24 * HOUR) });
      const next = await chooseLeadOwner(prisma, "ROUND_ROBIN", null, ownerId);
      expect(next.auto).toBe(true);
      expect(next.ownerId).not.toBe(temp.id);
    });

    it("project-wise picks someone mapped to the project, even over someone less recent", async () => {
      const onProject = await project("MAPPED");
      await prisma.userProject.create({ data: { userId: temp.id, projectId: onProject } });
      expect(await chooseLeadOwner(prisma, "PROJECT", onProject, ownerId)).toEqual({ ownerId: temp.id, auto: true });
    });

    it("project-wise still assigns when nobody on the project can take leads", async () => {
      const unmapped = await project("UNMAPPED");
      const res = await chooseLeadOwner(prisma, "PROJECT", unmapped, ownerId);
      expect(res.auto).toBe(true);
      expect(res.ownerId).not.toBe(ownerId);
    });
  });

  /* ---------------------------- First response ---------------------------- */

  describe("first response time", () => {
    it("is timed from assignment on the first follow-up, and never overwritten", async () => {
      const l = await lead({ assignedAt: new Date(Date.now() - 90 * MIN) });
      await actAs("sales@nninfra.example");

      expect((await leads.logFollowUpAction(l.id, "CALL", "Spoke to them", "", "")).ok).toBe(true);
      const first = (await reload(l.id)).firstResponseMins!;
      expect(first).toBeGreaterThanOrEqual(89);
      expect(first).toBeLessThanOrEqual(92);

      await leads.logFollowUpAction(l.id, "CALL", "Called again", "", "");
      expect((await reload(l.id)).firstResponseMins).toBe(first);
    });

    it("counts a stage change as a response", async () => {
      const l = await lead({ assignedAt: new Date(Date.now() - 30 * MIN) });
      await actAs("sales@nninfra.example");
      expect((await leads.changeLeadStageAction(l.id, "CONTACTED")).ok).toBe(true);
      const mins = (await reload(l.id)).firstResponseMins!;
      expect(mins).toBeGreaterThanOrEqual(29);
      expect(mins).toBeLessThanOrEqual(32);
    });

    it("records only once when two responses land together", async () => {
      const l = await lead({ assignedAt: new Date(Date.now() - 10 * MIN) });
      const results = await Promise.all([
        recordFirstResponse(prisma, l.id, new Date()),
        recordFirstResponse(prisma, l.id, new Date()),
      ]);
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });
  });

  /* ------------------------------- Escalation ----------------------------- */

  describe("overdue follow-up escalation", () => {
    let afterHours: number;
    beforeAll(async () => {
      afterHours = (await getSetting(prisma, "sales.followUpEscalation")).afterHours;
    });

    const notified = (leadId: string, userId: string) =>
      prisma.notification.count({ where: { entityId: leadId, userId } });

    it("notifies the sales head once a follow-up stays overdue past the grace period", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());

      expect((await reload(l.id)).escalatedAt).not.toBeNull();
      expect(await notified(l.id, headId)).toBe(1);
      expect(await notified(l.id, ownerId)).toBe(0);
    });

    it("does not notify twice for the same lapse", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      await escalateOverdueFollowUps(prisma, new Date());
      expect(await notified(l.id, headId)).toBe(1);
    });

    it("concurrent sweeps still notify only once", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await Promise.all([
        escalateOverdueFollowUps(prisma, new Date()),
        escalateOverdueFollowUps(prisma, new Date()),
        escalateOverdueFollowUps(prisma, new Date()),
      ]);
      expect(await notified(l.id, headId)).toBe(1);
    });

    it("waits out the grace period first", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - Math.max(1, afterHours - 1) * HOUR + MIN) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(l.id)).escalatedAt).toBeNull();
    });

    it("leaves booked and lost leads alone", async () => {
      const booked = await lead({ state: "BOOKED", nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(booked.id)).escalatedAt).toBeNull();
    });

    it("logging a follow-up starts a fresh lapse", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(l.id)).escalatedAt).not.toBeNull();

      await actAs("sales@nninfra.example");
      const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString();
      expect((await leads.logFollowUpAction(l.id, "CALL", "Back in touch", "", tomorrow)).ok).toBe(true);
      expect((await reload(l.id)).escalatedAt).toBeNull();
    });
  });

  /* ----------------------------- Notifications ---------------------------- */

  describe("notifications are personal", () => {
    it("lets the recipient mark one read, and nobody else", async () => {
      const l = await lead({ state: "CONTACTED", nextActionAt: new Date(Date.now() - 1000 * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      const note = await prisma.notification.findFirstOrThrow({ where: { entityId: l.id, userId: headId } });

      await actAs("sales@nninfra.example");
      const intruder = await inbox.markNotificationReadAction(note.id);
      expect(intruder.ok).toBe(false);
      if (!intruder.ok) expect(intruder.error).toMatch(/not found/i);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).toBeNull();

      await actAs("saleshead@nninfra.example");
      expect((await inbox.markNotificationReadAction(note.id)).ok).toBe(true);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).not.toBeNull();
    });
  });

  /* -------------------------------- Settings ------------------------------ */

  describe("settings", () => {
    it("refuses a change from someone without the permission", async () => {
      await actAs("sales@nninfra.example");
      const res = await settings.updateEscalationHoursAction(6);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("admin.settings.update");
    });

    it("saves the escalation grace period", async () => {
      await actAs("owner@nninfra.example");
      expect((await settings.updateEscalationHoursAction(6)).ok).toBe(true);
      expect((await getSetting(prisma, "sales.followUpEscalation")).afterHours).toBe(6);
    });

    it("refuses a grace period that is not a positive whole number of hours", async () => {
      await actAs("owner@nninfra.example");
      for (const bad of [0, -3, 2.5]) {
        expect((await settings.updateEscalationHoursAction(bad)).ok).toBe(false);
      }
    });

    it("refuses an unknown assignment mode, and changes nothing", async () => {
      const before = await getSetting(prisma, "sales.leadAssignment");
      await actAs("owner@nninfra.example");
      expect((await settings.updateLeadAssignmentModeAction("BY_ASTROLOGY")).ok).toBe(false);
      expect(await getSetting(prisma, "sales.leadAssignment")).toEqual(before);
    });

    it("falls back to the default when a stored value is damaged", async () => {
      await prisma.appSetting.upsert({
        where: { key: "sales.followUpEscalation" },
        create: { key: "sales.followUpEscalation", value: { afterHours: "soon" } },
        update: { value: { afterHours: "soon" } },
      });
      expect((await getSetting(prisma, "sales.followUpEscalation")).afterHours).toBe(24);
    });
  });
});
