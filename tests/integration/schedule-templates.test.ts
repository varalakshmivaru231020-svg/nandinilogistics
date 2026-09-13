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

import * as sched from "@/app/(app)/schedule/actions";

bindCookieBox(cookieBox);

const DAY = 86_400_000;
const dayOf = (x: Date | null, base: number) => (x === null ? null : Math.round((x.getTime() - base) / DAY));

/**
 * Schedule templates end to end. These run against throwaway projects rather
 * than the demo project: saving captures a *whole* project's schedule, and the
 * demo project holds seeded activities plus whatever parallel test files are
 * creating, so any count taken there would be nondeterministic.
 */
describe("schedule templates", () => {
  const S = tag().toUpperCase();
  const SOURCE_BASE = Date.UTC(2031, 5, 1);
  const APPLY_ON = "2032-02-01";
  const APPLY_BASE = Date.UTC(2032, 1, 1);

  const projectIds: string[] = [];
  const templateIds: string[] = [];
  let source: string;
  let target: string;
  let clashing: string;
  let empty: string;

  async function project(label: string) {
    const type = await prisma.projectType.findFirstOrThrow();
    const p = await prisma.project.create({
      data: { code: `TPL-${S}-${label}`, name: `Template test ${label}`, projectTypeId: type.id },
    });
    projectIds.push(p.id);
    return p.id;
  }

  beforeAll(async () => {
    source = await project("SRC");
    target = await project("DST");
    clashing = await project("CLASH");
    empty = await project("EMPTY");

    // Source schedule: EXC days 0–5, RAFT days 5–13, RAFT waits on EXC.
    const exc = await prisma.scheduleActivity.create({
      data: {
        projectId: source, code: `EXC-${S}`, name: "Excavation", sequence: 1,
        plannedStart: new Date(SOURCE_BASE), plannedEnd: new Date(SOURCE_BASE + 5 * DAY),
        baselineStart: new Date(SOURCE_BASE), baselineEnd: new Date(SOURCE_BASE + 5 * DAY),
      },
    });
    const raft = await prisma.scheduleActivity.create({
      data: {
        projectId: source, code: `RAFT-${S}`, name: "Raft", sequence: 2,
        plannedStart: new Date(SOURCE_BASE + 5 * DAY), plannedEnd: new Date(SOURCE_BASE + 13 * DAY),
        baselineStart: new Date(SOURCE_BASE + 5 * DAY), baselineEnd: new Date(SOURCE_BASE + 13 * DAY),
      },
    });
    await prisma.scheduleDependency.create({
      data: { predecessorId: exc.id, successorId: raft.id, type: "FS", lagDays: 0 },
    });

    // A project that already uses one of the template's codes.
    await prisma.scheduleActivity.create({
      data: {
        projectId: clashing, code: `RAFT-${S}`, name: "Existing raft",
        plannedStart: new Date(APPLY_BASE), plannedEnd: new Date(APPLY_BASE + DAY),
        baselineStart: new Date(APPLY_BASE), baselineEnd: new Date(APPLY_BASE + DAY),
      },
    });
  });

  afterAll(async () => {
    const acts = await prisma.scheduleActivity.findMany({
      where: { projectId: { in: projectIds } }, select: { id: true },
    });
    const ids = acts.map((a) => a.id);
    await prisma.scheduleDependency.deleteMany({
      where: { OR: [{ predecessorId: { in: ids } }, { successorId: { in: ids } }] },
    });
    await prisma.scheduleActivity.deleteMany({ where: { id: { in: ids } } });
    await prisma.scheduleTemplate.deleteMany({
      where: { OR: [{ id: { in: templateIds } }, { name: { contains: S } }] },
    });
    await prisma.userProject.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses to save for someone without the permission", async () => {
    await actAs("sales@nninfra.example");
    const res = await sched.saveScheduleAsTemplateAction(source, `Refused ${S}`, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.template.save");
  });

  it("captures a schedule's activities and its links", async () => {
    await actAs("owner@nninfra.example");
    const res = await sched.saveScheduleAsTemplateAction(source, `Tower ${S}`, "Structure only");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    templateIds.push(res.data.id);
    expect(res.data.activityCount).toBe(2);

    const stored = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { id: res.data.id } });
    const shape = stored.shape as { activities: Array<{ code: string; offsetDays: number }>; links: unknown[] };
    expect(shape.links).toHaveLength(1);
    expect(shape.activities.find((a) => a.code === `RAFT-${S}`)!.offsetDays).toBe(5);
  });

  it("refuses a second template with the same name", async () => {
    await actAs("owner@nninfra.example");
    const res = await sched.saveScheduleAsTemplateAction(source, `Tower ${S}`, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already exists/i);
  });

  it("refuses to save an empty schedule", async () => {
    await actAs("owner@nninfra.example");
    const res = await sched.saveScheduleAsTemplateAction(empty, `Empty ${S}`, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/nothing/i);
  });

  it("lays the template onto another project at the chosen date, links and all", async () => {
    await actAs("owner@nninfra.example");
    const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { name: `Tower ${S}` } });

    const res = await sched.applyTemplateAction(template.id, target, APPLY_ON);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.created).toBe(2);

    const raft = await prisma.scheduleActivity.findUniqueOrThrow({
      where: { projectId_code: { projectId: target, code: `RAFT-${S}` } },
    });
    expect(dayOf(raft.plannedStart, APPLY_BASE)).toBe(5);
    expect(dayOf(raft.plannedEnd, APPLY_BASE)).toBe(13);
    // The template's dates become the new project's frozen baseline.
    expect(dayOf(raft.baselineStart, APPLY_BASE)).toBe(5);

    const links = await prisma.scheduleDependency.count({ where: { successorId: raft.id } });
    expect(links).toBe(1);
  });

  it("refuses to apply onto a project that already uses a code — and names it", async () => {
    await actAs("owner@nninfra.example");
    const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { name: `Tower ${S}` } });
    const before = await prisma.scheduleActivity.count({ where: { projectId: clashing } });

    const res = await sched.applyTemplateAction(template.id, clashing, APPLY_ON);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(`RAFT-${S}`);
    // Nothing half-applied.
    expect(await prisma.scheduleActivity.count({ where: { projectId: clashing } })).toBe(before);
  });

  it("refuses to apply without a start date", async () => {
    await actAs("owner@nninfra.example");
    const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { name: `Tower ${S}` } });
    const res = await sched.applyTemplateAction(template.id, empty, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/date/i);
  });

  it("refuses to apply for someone without the permission", async () => {
    await actAs("sales@nninfra.example");
    const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { name: `Tower ${S}` } });
    const res = await sched.applyTemplateAction(template.id, empty, APPLY_ON);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("schedule.template.apply");
  });

  it("deleting a template leaves schedules built from it untouched", async () => {
    await actAs("owner@nninfra.example");
    const template = await prisma.scheduleTemplate.findUniqueOrThrow({ where: { name: `Tower ${S}` } });
    const before = await prisma.scheduleActivity.count({ where: { projectId: target } });

    expect((await sched.deleteTemplateAction(template.id)).ok).toBe(true);
    expect(await prisma.scheduleTemplate.findUnique({ where: { id: template.id } })).toBeNull();
    expect(await prisma.scheduleActivity.count({ where: { projectId: target } })).toBe(before);
  });
});
