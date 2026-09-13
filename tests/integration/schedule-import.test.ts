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
import { prisma, tag } from "./helpers";

import * as importActions from "@/app/(app)/schedule/import-actions";
import { planActivityImport, type PlannedActivity } from "@/lib/schedule/activity-import";
import { writeActivityImport } from "@/lib/schedule/activity-import-service";
import { isLinkType, type EngineLink } from "@/lib/schedule/engine";

bindCookieBox(cookieBox);

const DAY = 86_400_000;
const dayOf = (x: Date | null, base: number) => (x === null ? null : Math.round((x.getTime() - base) / DAY));

/**
 * Schedule import against the database, on a throwaway project: activities,
 * baselines, links and the reschedule all land in one transaction.
 */
describe("schedule import", () => {
  const S = tag().toUpperCase();
  const BASE = Date.UTC(2033, 0, 1);
  const iso = (days: number) => new Date(BASE + days * DAY).toISOString().slice(0, 10);
  let projectId: string;

  const headers = ["Code", "Name", "Planned start", "Duration (days)", "Milestone", "Predecessors"];
  const sheet = (rows: string[][]) => ({
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
  });

  async function lookups() {
    const [existing, links] = await Promise.all([
      prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true, code: true } }),
      prisma.scheduleDependency.findMany({
        where: { predecessor: { projectId } },
        select: { predecessorId: true, successorId: true, type: true, lagDays: true },
      }),
    ]);
    const existingLinks: EngineLink[] = links
      .filter((l) => isLinkType(l.type))
      .map((l) => ({ ...l, type: l.type as EngineLink["type"] }));
    return { existing, existingLinks };
  }

  // RAFT is planned on day 0 but waits on EXC (days 0–10); COL waits 2 days after RAFT.
  const rows = [
    [`RAFT-${S}`, "Raft", iso(0), "5", "", `EXC-${S}`],
    [`COL-${S}`, "Columns", iso(0), "3", "yes", `RAFT-${S}+2`],
  ];

  beforeAll(async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    projectId = (await prisma.project.create({ data: { code: `SIM-${S}`, name: `Schedule import ${S}`, projectTypeId: type.id } })).id;
    await prisma.scheduleActivity.create({
      data: {
        projectId, code: `EXC-${S}`, name: "Excavation", sequence: 1,
        plannedStart: new Date(BASE), plannedEnd: new Date(BASE + 10 * DAY),
        baselineStart: new Date(BASE), baselineEnd: new Date(BASE + 10 * DAY),
      },
    });
  });

  afterAll(async () => {
    const acts = await prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true } });
    const ids = acts.map((a) => a.id);
    await prisma.scheduleDependency.deleteMany({ where: { OR: [{ predecessorId: { in: ids } }, { successorId: { in: ids } }] } });
    await prisma.scheduleActivity.deleteMany({ where: { projectId } });
    await prisma.auditLog.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("writes activities, baselines and links, then reschedules successors after their predecessors", async () => {
    const plan = planActivityImport(sheet(rows), await lookups());
    expect(plan.rows.map((r) => r.errors)).toEqual([[], []]);

    const result = await prisma.$transaction((tx) => writeActivityImport(tx, projectId, plan.rows.map((r) => r.input!)));
    expect(result).toMatchObject({ created: 2, links: 2, shifted: 2 });

    const raft = await prisma.scheduleActivity.findUniqueOrThrow({ where: { projectId_code: { projectId, code: `RAFT-${S}` } } });
    const col = await prisma.scheduleActivity.findUniqueOrThrow({ where: { projectId_code: { projectId, code: `COL-${S}` } } });

    // The baseline is what the file said; the plan is what the dependencies allow.
    expect([dayOf(raft.baselineStart, BASE), dayOf(raft.baselineEnd, BASE)]).toEqual([0, 5]);
    expect([dayOf(raft.plannedStart, BASE), dayOf(raft.plannedEnd, BASE)]).toEqual([10, 15]);
    expect([dayOf(col.plannedStart, BASE), dayOf(col.plannedEnd, BASE)]).toEqual([17, 20]);
    expect(col.isMilestone).toBe(true);

    const links = await prisma.scheduleDependency.findMany({ where: { successorId: col.id } });
    expect(links).toMatchObject([{ predecessorId: raft.id, type: "FS", lagDays: 2 }]);
    // One chain, so every activity is critical.
    expect(raft.isCriticalPath && col.isCriticalPath).toBe(true);
  });

  it("refuses the same codes when the file is planned again", async () => {
    const plan = planActivityImport(sheet(rows), await lookups());
    expect(plan.valid).toBe(0);
    expect(plan.rows[0].errors.join()).toMatch(/already exists in this project/);
  });

  it("rolls the whole import back when one row fails", async () => {
    const before = await prisma.scheduleActivity.count({ where: { projectId } });
    const good: PlannedActivity = {
      code: `NEW-${S}`, name: "New", sequence: 1, start: BASE, end: BASE + DAY, isMilestone: false,
      predecessors: [{ code: `EXC-${S}`, lagDays: 0 }],
    };

    // The good row is created first; the second fails in the database.
    await expect(
      prisma.$transaction((tx) => writeActivityImport(tx, projectId, [good, { ...good, code: `BAD-${S}`, sequence: 3_000_000_000 }])),
    ).rejects.toThrow();
    // The writer's own checks: a duplicate code and a loop.
    await expect(
      prisma.$transaction((tx) => writeActivityImport(tx, projectId, [good, { ...good, code: `RAFT-${S}` }])),
    ).rejects.toThrow(/already used/);
    await expect(
      prisma.$transaction((tx) => writeActivityImport(tx, projectId, [
        { ...good, code: `L1-${S}`, predecessors: [{ code: `L2-${S}`, lagDays: 0 }] },
        { ...good, code: `L2-${S}`, predecessors: [{ code: `L1-${S}`, lagDays: 0 }] },
      ])),
    ).rejects.toThrow(/loop/);

    expect(await prisma.scheduleActivity.count({ where: { projectId } })).toBe(before);
    expect(await prisma.scheduleActivity.findFirst({ where: { projectId, code: `NEW-${S}` } })).toBeNull();
  });

  it("imports through the action from an uploaded CSV, and refuses someone without the permission", async () => {
    const csv = `${headers.join(",")}\r\nROOF-${S},Roof,${iso(0)},4,,COL-${S}\r\nORPHAN-${S},Orphan,${iso(0)},1,,MISSING-${S}\r\n`;
    const form = () => {
      const fd = new FormData();
      fd.set("file", new File([csv], "schedule.csv", { type: "text/csv" }));
      return fd;
    };

    await actAs("sales@nninfra.example");
    const refused = await importActions.importActivitiesAction(projectId, form());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("schedule.activity.import");

    await actAs("owner@nninfra.example");
    const preview = await importActions.previewActivityImportAction(projectId, form());
    expect(preview.ok).toBe(true);
    if (preview.ok) expect([preview.data.valid, preview.data.invalid]).toEqual([1, 1]);

    const res = await importActions.importActivitiesAction(projectId, form());
    expect(res.ok).toBe(true);
    if (res.ok) expect([res.data.created, res.data.skipped]).toEqual([1, 1]);

    const roof = await prisma.scheduleActivity.findUniqueOrThrow({ where: { projectId_code: { projectId, code: `ROOF-${S}` } } });
    expect(dayOf(roof.plannedStart, BASE)).toBe(20);
  });
});
