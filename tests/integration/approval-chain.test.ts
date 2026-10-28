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

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, seededUsers, tag } from "./helpers";

import {
  createEmployeeAction, deleteEmployeeAction, setEmployeeStatusAction, submitOnboardingAction, updateEmployeeAction,
} from "@/app/(app)/hr/actions";
import { decideApprovalAction } from "@/app/(app)/approvals/actions";
import { loadInbox } from "@/lib/approvals/inbox";
import { getAuthContext } from "@/lib/rbac/context";

bindCookieBox(cookieBox);

/**
 * The approval chain through the real actions: a tele-caller's new rider and
 * edits wait for a Team Leader or Super Admin; a Team Leader's deletion waits
 * for Super Admin, and the Team Leader cannot approve it themselves; only
 * Super Admin adds internal staff.
 */
describe("the approval chain", () => {
  const S = tag();
  let riderTypeId: string;
  let staffTypeId: string | null;
  let companyId: string;
  let riderId: string;
  let tlId: string;

  function form(values: Record<string, string | string[]>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
      else fd.set(k, v);
    }
    return fd;
  }
  const rider = (name: string) => form({
    name, mobile: "9000022222", aadhaar: "4821 7734 9013", employmentTypeId: riderTypeId, companyIds: [companyId],
  });

  beforeAll(async () => {
    const users = await seededUsers();
    tlId = users.teamLeader.id;
    const type = await prisma.employmentType.findFirst({ where: { name: { equals: "Rider", mode: "insensitive" } } });
    if (!type) throw new Error("Run `pnpm db:seed`.");
    riderTypeId = type.id;
    staffTypeId = (await prisma.employmentType.findFirst({ where: { name: { equals: "Internal Staff", mode: "insensitive" } } }))?.id ?? null;
    const led = await prisma.companyTeamLeader.findFirst({ where: { userId: tlId }, select: { companyId: true } });
    if (!led) throw new Error("The seeded Team Leader leads no company.");
    companyId = led.companyId;
  });

  afterAll(async () => {
    const ids = (await prisma.employee.findMany({ where: { name: { contains: S } }, select: { id: true } })).map((e) => e.id);
    await prisma.changeRequest.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.riderCompany.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("holds a tele-caller's new rider for approval, and shows it to them", async () => {
    await actAs("telecaller@nandini.example");
    const res = await createEmployeeAction(rider(`Chain rider ${S}`));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    riderId = res.data.id;
    expect(res.data.pending).toBe(true);
    const row = await prisma.employee.findUnique({ where: { id: riderId } });
    expect(row?.approval).toBe("PENDING");
    // Hidden before: no lead, so the scope never reached it. Their own record is theirs.
    const mine = await prisma.employee.count({ where: { id: riderId, createdById: row?.createdById } });
    expect(mine).toBe(1);
    const submit = await submitOnboardingAction(riderId);
    expect(submit.ok).toBe(false);
  });

  it("refuses internal staff from anyone but Super Admin", async () => {
    if (!staffTypeId) return;
    await actAs("telecaller@nandini.example");
    const res = await createEmployeeAction(form({
      name: `Chain staff ${S}`, mobile: "9000033333", aadhaar: "4821 7734 9014", employmentTypeId: staffTypeId,
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Super Admin/);
  });

  it("puts it in the Team Leader's inbox, and the Team Leader's approval stands", async () => {
    await actAs("tl@nandini.example");
    const ctx = (await getAuthContext())!;
    const inbox = await loadInbox(prisma, ctx);
    expect(inbox.some((r) => r.kind === "RIDER" && r.id === riderId)).toBe(true);
    const res = await decideApprovalAction("RIDER", riderId, "APPROVED");
    expect(res.ok).toBe(true);
    const row = await prisma.employee.findUnique({ where: { id: riderId } });
    expect(row?.approval).toBe("APPROVED");
    expect(row?.approvalById).toBe(tlId);
  });

  it("holds a tele-caller's edit until it is approved", async () => {
    await actAs("telecaller@nandini.example");
    const res = await updateEmployeeAction(riderId, rider(`Chain rider renamed ${S}`));
    expect(res.ok && res.data.pending).toBe(true);
    expect((await prisma.employee.findUnique({ where: { id: riderId } }))?.name).toBe(`Chain rider ${S}`);

    await actAs("admin@nandini.example");
    const request = await prisma.changeRequest.findFirst({ where: { entityId: riderId, status: "PENDING" } });
    expect(request?.kind).toBe("UPDATE");
    expect((await decideApprovalAction("CHANGE", request!.id, "APPROVED")).ok).toBe(true);
    expect((await prisma.employee.findUnique({ where: { id: riderId } }))?.name).toBe(`Chain rider renamed ${S}`);
  });

  it("sends a Team Leader's deletion to Super Admin, not to the Team Leader", async () => {
    await actAs("tl@nandini.example");
    const res = await deleteEmployeeAction(riderId);
    expect(res.ok && res.data.pending).toBe(true);
    const request = await prisma.changeRequest.findFirst({ where: { entityId: riderId, status: "PENDING" } });
    expect(request?.kind).toBe("DELETE");

    const own = await decideApprovalAction("CHANGE", request!.id, "APPROVED");
    expect(own.ok).toBe(false);

    await actAs("admin@nandini.example");
    const ctx = (await getAuthContext())!;
    expect((await loadInbox(prisma, ctx)).some((r) => r.kind === "CHANGE" && r.id === request!.id)).toBe(true);
    expect((await decideApprovalAction("CHANGE", request!.id, "REJECTED", "Still working")).ok).toBe(true);
    expect(await prisma.employee.count({ where: { id: riderId } })).toBe(1);
  });

  it("holds a tele-caller's request to mark a rider Left", async () => {
    await actAs("telecaller@nandini.example");
    const res = await setEmployeeStatusAction(riderId, "INACTIVE", "Left the city");
    expect(res.ok && res.data.pending).toBe(true);
    expect((await prisma.employee.findUnique({ where: { id: riderId } }))?.status).toBe("ACTIVE");
  });
});
