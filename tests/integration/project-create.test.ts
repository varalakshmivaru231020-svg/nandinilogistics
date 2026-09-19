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

import { createProjectAction } from "@/app/(app)/projects/actions";

bindCookieBox(cookieBox);

/**
 * Creating a project takes the form as it is written.
 *
 * The design asks for a name and a code and validates nothing else. Reading
 * the rest strictly is what stopped projects being created: the land-area
 * field is labelled "4.2 acres", and parsing that as a number refused the
 * whole form.
 */
describe("projects: the create form is taken as written", () => {
  const S = tag();
  const made: string[] = [];

  beforeAll(async () => { await actAs("owner@nninfra.example"); });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: made } } });
    await cleanupActionSessions();
  });

  /** Posts what the panel posts: name, code, type, and the rest blank. */
  async function create(fields: Record<string, string> = {}) {
    const type = await prisma.projectType.findFirstOrThrow();
    const stamp = Math.random().toString(36).slice(2, 8).toUpperCase();
    const fd = new FormData();
    fd.set("name", `Create test ${S} ${stamp}`);
    fd.set("code", `CT${S}${stamp}`.slice(0, 12));
    fd.set("projectTypeId", type.id);
    for (const key of [
      "addressLine", "landAreaText", "reraNumber", "approvalDetails",
      "totalTowers", "totalFloors", "totalUnits", "startDate", "targetDate",
    ]) fd.set(key, "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);

    const res = await createProjectAction(fd, []);
    if (res.ok) made.push(res.data.id);
    return res;
  }

  it("creates with everything optional left blank", async () => {
    const res = await create();
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
  });

  it("takes the land area the way its own placeholder writes it", async () => {
    const res = await create({ landAreaText: "4.2 acres" });
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: (res as { data: { id: string } }).data.id } });
    expect(row.landAreaText).toBe("4.2 acres");
    expect(Number(row.landArea)).toBe(4.2);
  });

  it("keeps a measurement words cannot be reduced to a number", async () => {
    const res = await create({ landAreaText: "2 acres 30 guntas" });
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: (res as { data: { id: string } }).data.id } });
    // The words survive; the number is only what could be read out of them.
    expect(row.landAreaText).toBe("2 acres 30 guntas");
    expect(Number(row.landArea)).toBe(2);
  });

  it("does not refuse the form over a field with no number in it at all", async () => {
    const res = await create({ landAreaText: "about half an acre", totalTowers: "two" });
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: (res as { data: { id: string } }).data.id } });
    expect(row.landAreaText).toBe("about half an acre");
    expect(row.landArea).toBeNull();
    expect(row.totalTowers).toBe(0);
  });

  it("still insists on the two things the design insists on", async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    const fd = new FormData();
    fd.set("name", "");
    fd.set("code", "");
    fd.set("projectTypeId", type.id);
    const res = await createProjectAction(fd, []);
    expect(res.ok).toBe(false);
  });

  it("drafts the breakdown with the project, keeping its progress", async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    const stamp = Math.random().toString(36).slice(2, 8).toUpperCase();
    const fd = new FormData();
    fd.set("name", `Create wbs ${S} ${stamp}`);
    fd.set("code", `CW${S}${stamp}`.slice(0, 12));
    fd.set("projectTypeId", type.id);

    const res = await createProjectAction(fd, [
      { kind: "PHASE", code: "TOWER-A", name: "Tower A", progressPct: 40 },
      { kind: "WP", code: "FINISHING", name: "Tower A — Finishing", progressPct: 15 },
    ]);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    made.push((res as { data: { id: string } }).data.id);

    const phases = await prisma.projectPhase.findMany({
      where: { projectId: (res as { data: { id: string } }).data.id },
      include: { workPackages: true },
    });
    expect(phases).toHaveLength(1);
    expect(phases[0].name).toBe("Tower A");
    expect(phases[0].progressPct).toBe(40);
    expect(phases[0].workPackages).toHaveLength(1);
    expect(phases[0].workPackages[0].name).toBe("Tower A — Finishing");
    expect(phases[0].workPackages[0].progressPct).toBe(15);
  });

  it("refuses a work package that has no phase above it", async () => {
    const type = await prisma.projectType.findFirstOrThrow();
    const stamp = Math.random().toString(36).slice(2, 8).toUpperCase();
    const fd = new FormData();
    fd.set("name", `Create orphan ${S} ${stamp}`);
    fd.set("code", `CO${S}${stamp}`.slice(0, 12));
    fd.set("projectTypeId", type.id);

    const res = await createProjectAction(fd, [
      { kind: "WP", code: "ORPHAN", name: "Nothing above it", progressPct: 0 },
    ]);
    expect(res.ok).toBe(false);
  });
});
