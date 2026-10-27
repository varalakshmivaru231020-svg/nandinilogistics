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
import { prisma, seededUsers, tag } from "./helpers";

import { getAuthContext } from "@/lib/rbac/context";
import { loadInbox } from "@/lib/approvals/inbox";
import { attendanceDay } from "@/lib/hr/punch";

import * as leads from "@/app/(app)/sales/leads/actions";
import * as approvals from "@/app/(app)/approvals/actions";
import * as hr from "@/app/(app)/hr/actions";

bindCookieBox(cookieBox);

const ADMIN = "admin@nandini.example";
const TL = "tl@nandini.example";
const TELE = "telecaller@nandini.example";

/**
 * The fixed approval rule end to end: a tele-caller's lead waits, cannot be
 * worked, and is released or rejected from the Approvals inbox. Plus the
 * web's Check in / Check out for a tele-caller's person record.
 */
describe("approvals", () => {
  const S = tag();
  const created: string[] = [];
  let teleId: string;
  let tlId: string;

  async function teleLead(n: number) {
    await actAs(TELE);
    const fd = new FormData();
    fd.set("name", `Approval test ${S} ${n}`);
    fd.set("phone", `+91 91${String(Date.now()).slice(-6)}${n}${n}`);
    fd.set("location", "Test area");
    fd.set("ownerId", teleId);
    const res = await leads.createLeadAction(fd);
    if (!res.ok) throw new Error(res.error);
    created.push(res.data.id);
    return res.data.id;
  }
  const reload = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
  async function inboxFor(email: string) {
    await actAs(email);
    const ctx = await getAuthContext();
    return loadInbox(prisma, ctx!);
  }

  beforeAll(async () => {
    const users = await seededUsers();
    teleId = users.teleCaller.id;
    tlId = users.teamLeader.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { entityId: { in: created } } });
    await prisma.leadFollowUp.deleteMany({ where: { leadId: { in: created } } });
    await prisma.lead.deleteMany({ where: { id: { in: created } } });
    await cleanupActionSessions();
  });

  it("holds a tele-caller's lead for approval and tells the Team Leader", async () => {
    const id = await teleLead(1);
    expect((await reload(id)).approval).toBe("PENDING");
    expect(await prisma.notification.count({ where: { entityId: id, userId: tlId, kind: "APPROVAL_REQUESTED" } })).toBe(1);
  });

  it("refuses a follow-up until the lead is approved", async () => {
    const id = created[0];
    await actAs(TELE);
    const refused = await leads.logFollowUpAction(id, "CALL", "Called", "", "");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/approval/i);
  });

  it("shows the lead in the inbox of the Team Leader and Admin, not the tele-caller", async () => {
    const id = created[0];
    expect((await inboxFor(TL)).some((r) => r.kind === "LEAD" && r.id === id)).toBe(true);
    expect((await inboxFor(ADMIN)).some((r) => r.kind === "LEAD" && r.id === id)).toBe(true);
    expect(await inboxFor(TELE)).toEqual([]);
  });

  it("refuses a decision from the tele-caller", async () => {
    await actAs(TELE);
    const res = await approvals.decideApprovalAction("LEAD", created[0], "APPROVED");
    expect(res.ok).toBe(false);
  });

  it("lets the Team Leader approve, after which the follow-up goes through", async () => {
    const id = created[0];
    await actAs(TL);
    expect((await approvals.decideApprovalAction("LEAD", id, "APPROVED")).ok).toBe(true);
    const lead = await reload(id);
    expect(lead.approval).toBe("APPROVED");
    expect(lead.approvedById).toBe(tlId);
    expect(await prisma.notification.count({ where: { entityId: id, userId: teleId, kind: "APPROVAL_DECIDED" } })).toBe(1);

    await actAs(TELE);
    expect((await leads.logFollowUpAction(id, "CALL", "Called", "", "")).ok).toBe(true);
    expect((await inboxFor(TL)).some((r) => r.id === id)).toBe(false);
  });

  it("needs a reason to reject, and a rejected lead is read-only", async () => {
    const id = await teleLead(2);
    await actAs(TL);
    expect((await approvals.decideApprovalAction("LEAD", id, "REJECTED", "")).ok).toBe(false);
    expect((await approvals.decideApprovalAction("LEAD", id, "REJECTED", "Wrong number")).ok).toBe(true);
    const lead = await reload(id);
    expect(lead.approval).toBe("REJECTED");
    expect(lead.approvalNote).toBe("Wrong number");

    await actAs(TELE);
    expect((await leads.logFollowUpAction(id, "CALL", "Called", "", "")).ok).toBe(false);
    expect((await leads.addLeadNoteAction(id, "note")).ok).toBe(false);
    // Already decided: a second decision is refused.
    await actAs(TL);
    expect((await approvals.decideApprovalAction("LEAD", id, "APPROVED")).ok).toBe(false);
  });
});

describe("web check in / check out", () => {
  let employeeId: string;
  let saved: Awaited<ReturnType<typeof prisma.attendanceEntry.findUnique>> = null;
  const day = attendanceDay(new Date());

  beforeAll(async () => {
    const tele = await prisma.user.findUniqueOrThrow({ where: { email: TELE }, include: { employee: true } });
    if (!tele.employee) throw new Error("Run `pnpm staff:link` so the tele-caller has a person record.");
    employeeId = tele.employee.id;
    // Keep whatever today's row was, and put it back afterwards.
    saved = await prisma.attendanceEntry.findUnique({ where: { employeeId_attendanceOn: { employeeId, attendanceOn: day } } });
    if (saved) await prisma.attendanceEntry.delete({ where: { id: saved.id } });
  });

  afterAll(async () => {
    await prisma.attendanceEntry.deleteMany({ where: { employeeId, attendanceOn: day } });
    if (saved) await prisma.attendanceEntry.create({ data: saved as never });
    await cleanupActionSessions();
  });

  it("checks a tele-caller in without a location, and out again", async () => {
    await actAs(TELE);
    const first = await hr.punchInAction(null, null);
    expect(first.ok).toBe(true);
    expect((await hr.punchInAction(null, null)).ok).toBe(false);

    const row = await prisma.attendanceEntry.findUniqueOrThrow({ where: { employeeId_attendanceOn: { employeeId, attendanceOn: day } } });
    expect(row.punchInAt).not.toBeNull();
    expect(row.punchInLat).toBeNull();

    const out = await hr.punchOutAction(12.97, 77.59);
    expect(out.ok).toBe(true);
    // Minutes after checking in: under four hours is a half day.
    if (out.ok) expect(out.data.status).toBe("HALF_DAY");
  });
});
