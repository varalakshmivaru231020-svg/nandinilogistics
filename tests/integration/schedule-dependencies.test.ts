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
import * as ext from "@/app/(app)/schedule/extension-actions";

bindCookieBox(cookieBox);

const DAY = 86_400_000;
// Well clear of anything the seed plans, so every date below is unambiguous.
const BASE = Date.UTC(2031, 0, 1);
const d = (n: number) => new Date(BASE + n * DAY);
const dayOf = (x: Date | null) => (x === null ? null : Math.round((x.getTime() - BASE) / DAY));

/**
 * The scheduling engine wired into the actions that change a schedule. The
 * arithmetic itself is covered in tests/unit/schedule-engine.test.ts; this is
 * about the cascade actually happening where it should, and being refused where
 * it should not.
 */
describe("schedule dependencies — the cascade, end to end", () => {
  const suffix = tag();
  let projectId: string;
  const created: string[] = [];

  async function make(code: string, from: number, days: number) {
    const a = await prisma.scheduleActivity.create({
      data: {
        projectId,
        code: `DEP-${suffix}-${code}`,
        name: `Dependency test ${code}`,
        baselineStart: d(from), baselineEnd: d(from + days),
        plannedStart: d(from), plannedEnd: d(from + days),
      },
    });
    created.push(a.id);
    return a;
  }
  const reload = (id: string) => prisma.scheduleActivity.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    projectId = (await demoProject()).id;
  });

  afterAll(async () => {
    await prisma.scheduleDependency.deleteMany({
      where: { OR: [{ predecessorId: { in: created } }, { successorId: { in: created } }] },
    });
    await prisma.scheduleExtension.deleteMany({ where: { activityId: { in: created } } });
    await prisma.scheduleActivity.deleteMany({ where: { id: { in: created } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses to link activities for someone without the permission", async () => {
    const a = await make("P1", 0, 5);
    const b = await make("P2", 5, 3);
    await actAs("sales@nninfra.example");
    const res = await sched.addDependencyAction(b.id, a.id, "FS", 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.dependency.manage");
  });

  it("pushes the successor out the moment the link demands it", async () => {
    // A runs days 0–10, but B was planned to start on day 5.
    const a = await make("A1", 0, 10);
    const b = await make("B1", 5, 3);
    await actAs("pm@nninfra.example");
    const res = await sched.addDependencyAction(b.id, a.id, "FS", 0);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.shifted).toBe(1);

    const after = await reload(b.id);
    expect(dayOf(after.plannedStart)).toBe(10);
    expect(dayOf(after.plannedEnd)).toBe(13);
  });

  it("never moves the baseline, however far the plan is pushed", async () => {
    const a = await make("A2", 0, 20);
    const b = await make("B2", 2, 4);
    await actAs("pm@nninfra.example");
    await sched.addDependencyAction(b.id, a.id, "FS", 0);

    const after = await reload(b.id);
    expect(dayOf(after.plannedStart)).toBe(20);
    expect(dayOf(after.baselineStart)).toBe(2);
    expect(dayOf(after.baselineEnd)).toBe(6);
  });

  it("refuses a link that would close a loop, and saves nothing", async () => {
    const a = await make("A3", 0, 2);
    const b = await make("B3", 2, 2);
    await actAs("pm@nninfra.example");
    expect((await sched.addDependencyAction(b.id, a.id, "FS", 0)).ok).toBe(true);

    const res = await sched.addDependencyAction(a.id, b.id, "FS", 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/loop/i);
    expect(
      await prisma.scheduleDependency.count({ where: { predecessorId: b.id, successorId: a.id } }),
    ).toBe(0);
  });

  it("refuses an activity waiting on itself", async () => {
    const a = await make("A4", 0, 2);
    await actAs("pm@nninfra.example");
    const res = await sched.addDependencyAction(a.id, a.id, "FS", 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/itself/i);
  });

  it("refuses the same link twice", async () => {
    const a = await make("A5", 0, 2);
    const b = await make("B5", 2, 2);
    await actAs("pm@nninfra.example");
    expect((await sched.addDependencyAction(b.id, a.id, "FS", 0)).ok).toBe(true);

    const again = await sched.addDependencyAction(b.id, a.id, "SS", 0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already depends/i);
  });

  it("refuses an unknown link type and a fractional lag", async () => {
    const a = await make("A6", 0, 2);
    const b = await make("B6", 2, 2);
    await actAs("pm@nninfra.example");
    expect((await sched.addDependencyAction(b.id, a.id, "XX", 0)).ok).toBe(false);

    const res = await sched.addDependencyAction(b.id, a.id, "FS", 1.5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/whole number/i);
  });

  it("an approved extension moves everything waiting on it", async () => {
    // A 0–10 → B 10–13 → C 13–15, then A is extended by five days.
    const a = await make("A7", 0, 10);
    const b = await make("B7", 10, 3);
    const c = await make("C7", 13, 2);
    await actAs("pm@nninfra.example");
    await sched.addDependencyAction(b.id, a.id, "FS", 0);
    await sched.addDependencyAction(c.id, b.id, "FS", 0);

    await actAs("supervisor@nninfra.example");
    expect((await ext.requestExtensionAction(a.id, 5, "Monsoon")).ok).toBe(true);
    const request = await prisma.scheduleExtension.findFirstOrThrow({
      where: { activityId: a.id, status: "PENDING" },
    });

    await actAs("pm@nninfra.example");
    expect((await ext.decideExtensionAction(request.id, true, "")).ok).toBe(true);

    expect(dayOf((await reload(a.id)).plannedEnd)).toBe(15);
    expect(dayOf((await reload(b.id)).plannedStart)).toBe(15);
    expect(dayOf((await reload(c.id)).plannedStart)).toBe(18);
  });

  it("recording a late finish drags the successor after it", async () => {
    const a = await make("A8", 0, 5);
    const b = await make("B8", 5, 2);
    const reason = await prisma.delayReason.findFirstOrThrow();
    await actAs("pm@nninfra.example");
    await sched.addDependencyAction(b.id, a.id, "FS", 0);

    // Planned to finish day 5; actually finished day 9.
    const res = await sched.updateActivityProgressAction(
      a.id, 100, d(0).toISOString(), d(9).toISOString(), reason.id, "Concrete delivered late",
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.shifted).toBe(1);
    expect(dayOf((await reload(b.id)).plannedStart)).toBe(9);
  });

  it("removing a link leaves the dates where they are", async () => {
    const a = await make("A9", 0, 10);
    const b = await make("B9", 5, 3);
    await actAs("pm@nninfra.example");
    await sched.addDependencyAction(b.id, a.id, "FS", 0);
    const link = await prisma.scheduleDependency.findFirstOrThrow({
      where: { predecessorId: a.id, successorId: b.id },
    });

    const res = await sched.removeDependencyAction(link.id);
    expect(res.ok).toBe(true);
    // Push-only: the constraint is gone, but nobody was told to start sooner.
    expect(dayOf((await reload(b.id)).plannedStart)).toBe(10);
  });

  it("offers no way to set the critical path by hand any more", () => {
    expect("setCriticalPathAction" in sched).toBe(false);
  });
});
