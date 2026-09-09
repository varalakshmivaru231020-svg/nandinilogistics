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
import { prisma, demoProject, tag } from "./helpers";

import * as ext from "@/app/(app)/schedule/extension-actions";

bindCookieBox(cookieBox);

const DAY = 86_400_000;

describe("schedule extension requests", () => {
  const suffix = tag();
  let activityId: string;
  let projectId: string;
  let baselineEnd: Date;
  let plannedEnd: Date;

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;
    baselineEnd = new Date(Date.now() + 30 * DAY);
    plannedEnd = new Date(baselineEnd);

    const a = await prisma.scheduleActivity.create({
      data: {
        projectId,
        code: `EXT-${suffix}`,
        name: `Extension test ${suffix}`,
        baselineStart: new Date(),
        baselineEnd,
        plannedStart: new Date(),
        plannedEnd,
        progressPct: 40,
        status: "IN_PROGRESS",
      },
    });
    activityId = a.id;
  });

  afterAll(async () => {
    await prisma.scheduleExtension.deleteMany({ where: { activityId } });
    await prisma.scheduleActivity.delete({ where: { id: activityId } }).catch(() => undefined);
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses a request from someone without the permission", async () => {
    await actAs("store@nninfra.example");
    const res = await ext.requestExtensionAction(activityId, 7, "Rain");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.extension.request");
  });

  it("requires a reason", async () => {
    await actAs("supervisor@nninfra.example");
    const res = await ext.requestExtensionAction(activityId, 7, "   ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reason/i);
  });

  it("requires a positive number of days", async () => {
    await actAs("supervisor@nninfra.example");
    expect((await ext.requestExtensionAction(activityId, 0, "Rain")).ok).toBe(false);
  });

  it("lets the site raise a request", async () => {
    await actAs("supervisor@nninfra.example");
    const res = await ext.requestExtensionAction(activityId, 21, "Three weeks lost to rain");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 21 days past the current planned finish.
    const expected = new Date(plannedEnd.getTime() + 21 * DAY).toISOString().slice(0, 10);
    expect(res.data.requestedDate.slice(0, 10)).toBe(expected);
  });

  it("refuses a second request while one is pending", async () => {
    await actAs("supervisor@nninfra.example");
    const res = await ext.requestExtensionAction(activityId, 5, "More rain");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already pending/i);
  });

  it("does not move any date while the request is pending", async () => {
    const a = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: activityId } });
    expect(a.plannedEnd?.toISOString()).toBe(plannedEnd.toISOString());
    expect(a.baselineEnd?.toISOString()).toBe(baselineEnd.toISOString());
  });

  it("refuses a decision from someone who cannot approve", async () => {
    await actAs("supervisor@nninfra.example");
    const req = await prisma.scheduleExtension.findFirstOrThrow({ where: { activityId, status: "PENDING" } });
    const res = await ext.decideExtensionAction(req.id, true, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.extension.approve");
  });

  it("requires a note when refusing", async () => {
    await actAs("pm@nninfra.example");
    const req = await prisma.scheduleExtension.findFirstOrThrow({ where: { activityId, status: "PENDING" } });
    const res = await ext.decideExtensionAction(req.id, false, "  ");
    expect(res.ok).toBe(false);
  });

  it("moves the PLANNED finish when the PM approves", async () => {
    await actAs("pm@nninfra.example");
    const req = await prisma.scheduleExtension.findFirstOrThrow({ where: { activityId, status: "PENDING" } });
    const res = await ext.decideExtensionAction(req.id, true, "Agreed, monsoon was exceptional");
    expect(res.ok).toBe(true);

    const a = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: activityId } });
    expect(a.plannedEnd?.toISOString().slice(0, 10)).toBe(
      new Date(plannedEnd.getTime() + 21 * DAY).toISOString().slice(0, 10),
    );
  });

  it("NEVER moves the baseline — that is the whole point", async () => {
    const a = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: activityId } });
    expect(a.baselineEnd?.toISOString()).toBe(baselineEnd.toISOString());
  });

  it("records who decided it, and when", async () => {
    const req = await prisma.scheduleExtension.findFirstOrThrow({ where: { activityId } });
    expect(req.status).toBe("APPROVED");
    expect(req.decidedById).toBeTruthy();
    expect(req.decidedAt).toBeTruthy();
    expect(req.decisionNote).toMatch(/monsoon/i);
  });

  it("will not decide the same request twice", async () => {
    await actAs("pm@nninfra.example");
    const req = await prisma.scheduleExtension.findFirstOrThrow({ where: { activityId } });
    const res = await ext.decideExtensionAction(req.id, true, "again");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already been decided/i);
  });

  it("writes the decision to the audit trail", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "ScheduleExtension", action: "APPROVE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.summary).toMatch(/baseline unchanged/i);
  });
});
