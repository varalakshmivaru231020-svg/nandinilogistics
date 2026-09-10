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

import * as sched from "@/app/(app)/schedule/actions";

bindCookieBox(cookieBox);

const DAY = 86_400_000;

/**
 * The design's one-click row actions. They are the narrow form of a progress
 * update, so the invariants that matter are the same: the baseline never moves,
 * and a finished activity cannot be restarted.
 */
describe("starting and completing a schedule activity", () => {
  const suffix = tag();
  let projectId: string;
  const created: string[] = [];

  async function makeActivity(overrides: Record<string, unknown> = {}) {
    const a = await prisma.scheduleActivity.create({
      data: {
        projectId,
        code: `PRG-${suffix}-${created.length}`,
        name: `Progress test ${suffix}-${created.length}`,
        baselineStart: new Date(Date.now() - 10 * DAY),
        baselineEnd: new Date(Date.now() + 10 * DAY),
        plannedStart: new Date(Date.now() - 10 * DAY),
        plannedEnd: new Date(Date.now() + 10 * DAY),
        progressPct: 0,
        status: "NOT_STARTED",
        ...overrides,
      },
    });
    created.push(a.id);
    return a;
  }

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.scheduleActivity.deleteMany({ where: { id: { in: created } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses a start from someone without the permission", async () => {
    const a = await makeActivity();
    await actAs("sales@nninfra.example");
    const res = await sched.startActivityAction(a.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.activity.start");
  });

  it("lets the supervisor start an activity and stamps the actual start", async () => {
    const a = await makeActivity();
    await actAs("supervisor@nninfra.example");
    const res = await sched.startActivityAction(a.id);
    expect(res.ok).toBe(true);

    const after = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.actualStart).not.toBeNull();
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.progressPct).toBeGreaterThan(0);
  });

  it("refuses to start something already started", async () => {
    const a = await makeActivity({ actualStart: new Date(), status: "IN_PROGRESS" });
    await actAs("supervisor@nninfra.example");
    const res = await sched.startActivityAction(a.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already started/i);
  });

  it("completes an activity at 100% with an actual finish", async () => {
    const a = await makeActivity({ actualStart: new Date(Date.now() - DAY), status: "IN_PROGRESS", progressPct: 60 });
    await actAs("supervisor@nninfra.example");
    const res = await sched.completeActivityAction(a.id);
    expect(res.ok).toBe(true);

    const after = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.progressPct).toBe(100);
    expect(after.actualEnd).not.toBeNull();
    expect(after.status).toBe("COMPLETED");
  });

  it("completing something never started still stamps a start", async () => {
    const a = await makeActivity();
    await actAs("supervisor@nninfra.example");
    expect((await sched.completeActivityAction(a.id)).ok).toBe(true);

    const after = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.actualStart).not.toBeNull();
  });

  it("reports lateness when the finish is past the plan", async () => {
    const a = await makeActivity({
      plannedEnd: new Date(Date.now() - 5 * DAY),
      actualStart: new Date(Date.now() - 20 * DAY),
      status: "IN_PROGRESS",
    });
    await actAs("supervisor@nninfra.example");
    const res = await sched.completeActivityAction(a.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.late).toBe(true);
  });

  it("refuses to complete twice", async () => {
    const a = await makeActivity({ status: "COMPLETED", progressPct: 100, actualEnd: new Date() });
    await actAs("supervisor@nninfra.example");
    const res = await sched.completeActivityAction(a.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already complete/i);
  });

  it("NEVER moves the baseline", async () => {
    const a = await makeActivity();
    const before = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: a.id } });

    await actAs("supervisor@nninfra.example");
    await sched.startActivityAction(a.id);
    await sched.completeActivityAction(a.id);

    const after = await prisma.scheduleActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.baselineStart?.getTime()).toBe(before.baselineStart?.getTime());
    expect(after.baselineEnd?.getTime()).toBe(before.baselineEnd?.getTime());
  });
});
