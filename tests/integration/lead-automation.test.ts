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
import { prisma, seededUsers, stageOfKind, tag } from "./helpers";

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

const ADMIN = "admin@nandini.example";
const TL = "tl@nandini.example";
const TELE = "telecaller@nandini.example";

/**
 * Lead assignment by the SOW's rule, response time and follow-up escalation,
 * end to end. The escalation setting is only ever changed here and is restored
 * afterwards.
 */
describe("lead automation", () => {
  const S = tag().toUpperCase();
  const createdLeads: string[] = [];

  let adminId: string;
  let tlId: string;
  let teleId: string;
  let tele2Id: string;
  let temp: { id: string };
  let openStageId: string;
  let lostStageId: string;
  let escalationBefore: { value: unknown } | null;

  async function lead(over: Record<string, unknown> = {}) {
    const row = await prisma.lead.create({
      data: {
        leadNo: `LA-${S}-${createdLeads.length}`,
        name: `Automation test ${createdLeads.length}`,
        phone: `90000${String(createdLeads.length).padStart(5, "0")}`,
        stageId: openStageId,
        ownerId: teleId,
        assignedAt: new Date(),
        ...over,
      },
    });
    createdLeads.push(row.id);
    return row;
  }
  const reload = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const users = await seededUsers();
    adminId = users.admin.id;
    tlId = users.teamLeader.id;
    teleId = users.teleCaller.id;
    tele2Id = users.teleCaller2.id;
    openStageId = (await stageOfKind("OPEN")).id;
    lostStageId = (await stageOfKind("LOST")).id;

    // Clear anything a previous, interrupted run left behind.
    const stale = await prisma.user.findMany({ where: { email: { startsWith: "lead-auto-" } }, select: { id: true } });
    if (stale.length) {
      const ids = stale.map((u) => u.id);
      await prisma.lead.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    // A third tele-caller, never assigned, so round-robin has a clear first pick.
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "TELE_CALLER" } });
    temp = await prisma.user.create({
      data: {
        employeeCode: `LA-${S}`,
        name: `Round Robin ${S}`,
        email: `lead-auto-${S.toLowerCase()}@nandini.example`,
        passwordHash: "not-a-real-hash",
        status: "ACTIVE",
      },
    });
    await prisma.userRole.create({ data: { userId: temp.id, roleId: role.id } });

    escalationBefore = await prisma.appSetting.findUnique({ where: { key: "sales.followUpEscalation" } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { entityId: { in: createdLeads } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeads } } });
    await prisma.lead.deleteMany({ where: { ownerId: temp.id } });
    await prisma.userRole.deleteMany({ where: { userId: temp.id } });
    await prisma.user.delete({ where: { id: temp.id } }).catch(() => undefined);

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
    it("hands new leads to tele-callers — not Admin, not a Team Leader", async () => {
      const pool = await usersHolding(prisma, PERM.sales.lead.receiveAssignment);
      expect(pool).toContain(teleId);
      expect(pool).toContain(tele2Id);
      expect(pool).toContain(temp.id);
      expect(pool).not.toContain(adminId);
      expect(pool).not.toContain(tlId);
    });

    it("tells the Team Leader about lapses — not Admin, and not the tele-callers", async () => {
      const recipients = await usersHolding(prisma, PERM.sales.followUp.receiveEscalation);
      expect(recipients).toContain(tlId);
      expect(recipients).not.toContain(adminId);
      expect(recipients).not.toContain(teleId);
    });

    it("never gives both duties to the same person", async () => {
      const [assignees, escalated] = await Promise.all([
        usersHolding(prisma, PERM.sales.lead.receiveAssignment),
        usersHolding(prisma, PERM.sales.followUp.receiveEscalation),
      ]);
      expect(assignees.filter((id) => escalated.includes(id))).toEqual([]);
    });
  });

  /* ------------------------------ Assignment ------------------------------ */

  describe("choosing who owns a new lead", () => {
    const admin = { id: "", canAssign: true, receivesLeads: false };
    const tele = { id: "", canAssign: false, receivesLeads: true };
    const rider = { id: "", canAssign: false, receivesLeads: false };

    it("makes Admin name a tele-caller", async () => {
      await expect(chooseLeadOwner(prisma, { ...admin, id: adminId }, null)).rejects.toThrow(/Choose the tele-caller/);
      expect(await chooseLeadOwner(prisma, { ...admin, id: adminId }, teleId)).toEqual({ ownerId: teleId, auto: false });
    });

    it("refuses to hand a lead to somebody who is not a tele-caller", async () => {
      await expect(chooseLeadOwner(prisma, { ...admin, id: adminId }, tlId)).rejects.toThrow(/tele-caller/);
    });

    it("lets a tele-caller keep what they capture", async () => {
      expect(await chooseLeadOwner(prisma, { ...tele, id: teleId }, null)).toEqual({ ownerId: teleId, auto: false });
    });

    it("hands a rider's referral to the tele-caller never assigned before anyone else", async () => {
      // Whoever has never been handed a lead goes first; the seeded tele-callers
      // may also have none yet, so the pick is any never-assigned tele-caller.
      const neverAssigned = [];
      for (const id of [teleId, tele2Id, temp.id]) {
        if ((await prisma.lead.count({ where: { ownerId: id, assignedAt: { not: null } } })) === 0) neverAssigned.push(id);
      }
      const pick = await chooseLeadOwner(prisma, { ...rider, id: adminId }, null);
      expect(pick.auto).toBe(true);
      expect(neverAssigned).toContain(pick.ownerId);
    });

    it("round-robin moves on once that person has been given one", async () => {
      await lead({ ownerId: temp.id, assignedAt: new Date(Date.now() + 365 * 24 * HOUR) });
      const next = await chooseLeadOwner(prisma, { ...rider, id: adminId }, null);
      expect(next.auto).toBe(true);
      expect(next.ownerId).not.toBe(temp.id);
    });
  });

  /* ---------------------------- First response ---------------------------- */

  describe("first response time", () => {
    it("is timed from assignment on the first follow-up, and never overwritten", async () => {
      const l = await lead({ assignedAt: new Date(Date.now() - 90 * MIN) });
      await actAs(TELE);

      expect((await leads.logFollowUpAction(l.id, "CALL", "Spoke to them", "", "")).ok).toBe(true);
      const first = (await reload(l.id)).firstResponseMins!;
      expect(first).toBeGreaterThanOrEqual(89);
      expect(first).toBeLessThanOrEqual(92);

      await leads.logFollowUpAction(l.id, "CALL", "Called again", "", "");
      expect((await reload(l.id)).firstResponseMins).toBe(first);
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

    it("notifies the Team Leader once a follow-up stays overdue past the grace period", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());

      expect((await reload(l.id)).escalatedAt).not.toBeNull();
      expect(await notified(l.id, tlId)).toBe(1);
      expect(await notified(l.id, adminId)).toBe(0);
    });

    it("does not notify twice for the same lapse", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      await escalateOverdueFollowUps(prisma, new Date());
      expect(await notified(l.id, tlId)).toBe(1);
    });

    it("concurrent sweeps still notify only once", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await Promise.all([
        escalateOverdueFollowUps(prisma, new Date()),
        escalateOverdueFollowUps(prisma, new Date()),
        escalateOverdueFollowUps(prisma, new Date()),
      ]);
      expect(await notified(l.id, tlId)).toBe(1);
    });

    it("waits out the grace period first", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - Math.max(1, afterHours - 1) * HOUR + MIN) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(l.id)).escalatedAt).toBeNull();
    });

    it("leaves lost leads alone", async () => {
      const lost = await lead({ stageId: lostStageId, nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(lost.id)).escalatedAt).toBeNull();
    });

    it("logging a follow-up starts a fresh lapse", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - (afterHours + 24) * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      expect((await reload(l.id)).escalatedAt).not.toBeNull();

      await actAs(TELE);
      const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString();
      expect((await leads.logFollowUpAction(l.id, "CALL", "Back in touch", "", tomorrow)).ok).toBe(true);
      expect((await reload(l.id)).escalatedAt).toBeNull();
    });
  });

  /* ----------------------------- Notifications ---------------------------- */

  describe("notifications are personal", () => {
    it("lets the recipient mark one read, and nobody else", async () => {
      const l = await lead({ nextActionAt: new Date(Date.now() - 1000 * HOUR) });
      await escalateOverdueFollowUps(prisma, new Date());
      const note = await prisma.notification.findFirstOrThrow({ where: { entityId: l.id, userId: tlId } });

      await actAs(TELE);
      const intruder = await inbox.markNotificationReadAction(note.id);
      expect(intruder.ok).toBe(false);
      if (!intruder.ok) expect(intruder.error).toMatch(/not found/i);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).toBeNull();

      await actAs(TL);
      expect((await inbox.markNotificationReadAction(note.id)).ok).toBe(true);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt).not.toBeNull();
    });
  });

  /* -------------------------------- Settings ------------------------------ */

  describe("settings", () => {
    it("refuses a change from someone without the permission", async () => {
      await actAs(TELE);
      const res = await settings.updateEscalationHoursAction(6);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("admin.settings.update");
    });

    it("saves the escalation grace period", async () => {
      await actAs(ADMIN);
      expect((await settings.updateEscalationHoursAction(6)).ok).toBe(true);
      expect((await getSetting(prisma, "sales.followUpEscalation")).afterHours).toBe(6);
    });

    it("refuses a grace period that is not a positive whole number of hours", async () => {
      await actAs(ADMIN);
      for (const bad of [0, -3, 2.5]) {
        expect((await settings.updateEscalationHoursAction(bad)).ok).toBe(false);
      }
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
