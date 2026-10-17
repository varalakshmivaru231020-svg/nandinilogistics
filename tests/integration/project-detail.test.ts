import { describe, expect, it, vi } from "vitest";

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
import { prisma } from "./helpers";

import { projectRecord } from "@/lib/records/project";
import { resolveForm } from "@/lib/forms/resolve";
import { getAuthContext } from "@/lib/rbac/context";

bindCookieBox(cookieBox);

/**
 * The project record, against the web's own five tabs.
 *
 * The phone had the right cards and no tabs, so everything stacked into one
 * scroll with the project master on top of all of it — and its "Tasks" card
 * held the phases and work packages, which is what that tab used to be on the
 * web before it became the work assigned against the project.
 */
describe("a project as the phone is sent it", () => {
  it("has the web's tabs, in its order and its words", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;
    const project = await prisma.project.findFirstOrThrow({
      where: { code: "NNS" },
      select: { id: true },
    });

    const rec = (await projectRecord(ctx, project.id))!;
    expect(rec.tabs?.map((t) => t.key)).toEqual(["overview", "wbs", "team", "docs", "log"]);
    expect(rec.tabs?.map((t) => t.label)).toEqual([
      "Overview",
      "Tasks",
      "Team Mapping",
      "Documents",
      "Site Progress",
    ]);

    // Each card under its own tab, and the particulars under Overview rather
    // than above everything.
    expect(rec.sections.map((s) => s.tab)).toEqual(["overview"]);
    expect(rec.sections[0].label).toBe("Project master");
    const tabsOf = (prefix: string) =>
      rec.collections.find((c) => c.key.startsWith(prefix))?.tab;
    expect(tabsOf("tasks:")).toBe("wbs");
    expect(tabsOf("team:")).toBe("team");
    expect(tabsOf("docs:")).toBe("docs");
    expect(tabsOf("progress:")).toBe("log");

    // Nothing is left tabless, which would draw it on every tab.
    const orphans = rec.collections.filter((c) => !c.tab).map((c) => c.key);
    expect(orphans).toEqual([]);

    await cleanupActionSessions();
  });

  it("lists the work assigned against it, not the breakdown", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;
    const project = await prisma.project.findFirstOrThrow({
      where: { tasks: { some: {} } },
      select: { id: true, tasks: { select: { id: true, taskNo: true }, take: 1 } },
    });

    const rec = (await projectRecord(ctx, project.id))!;
    const tasks = rec.collections.find((c) => c.key.startsWith("tasks:"))!;
    expect(tasks.label).toMatch(/^Tasks on this project · \d+$/);
    expect(tasks.emptyMessage).toBe("No task has been raised against this project yet.");

    // Every row opens the task itself, as the web's row is a link to it.
    for (const row of tasks.rows) {
      expect(row.opens?.module).toBe("tasks");
      expect(row.opens?.id).toBe(row.id);
    }
    // And no phase or work package is in there any more.
    expect(rec.collections.some((c) => c.key.startsWith("wbs:"))).toBe(false);

    await cleanupActionSessions();
  });

  it("puts each add button on the tab the web puts it on", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;
    const project = await prisma.project.findFirstOrThrow({
      where: { code: "NNS" },
      select: { id: true },
    });

    const rec = (await projectRecord(ctx, project.id))!;
    const on = (key: string) => rec.actions.find((a) => a.key === key);
    expect(on("newTask")?.tab).toBe("wbs");
    expect(on("newTask")?.label).toBe("New task");
    expect(on("newLog")?.tab).toBe("log");
    expect(on("newLog")?.label).toBe("Log entry");
    expect(on("upload")?.tab).toBe("docs");
    // The record's own action belongs to no tab, so it is always there.
    expect(on("edit")?.tab).toBeUndefined();

    await cleanupActionSessions();
  });

  it("raises a task already filled in with the project", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;
    const project = await prisma.project.findFirstOrThrow({
      where: { code: "NNS" },
      select: { id: true },
    });

    // As the web's "+ New task" link carries it: /tasks/new?project=<id>.
    const seeded = await resolveForm(ctx, "tasks:create", project.id);
    expect(typeof seeded === "string" ? seeded : "ok").toBe("ok");
    if (typeof seeded !== "string" && "fields" in seeded) {
      expect(seeded.fields.find((f) => f.name === "projectId")?.initial).toBe(project.id);
    }

    // Opened from its own list there is no record behind it, and it starts
    // empty — as the web's own New task page does.
    const bare = await resolveForm(ctx, "tasks:create");
    if (typeof bare !== "string" && "fields" in bare) {
      expect(bare.fields.find((f) => f.name === "projectId")?.initial).toBeUndefined();
    }

    await cleanupActionSessions();
  });

  it("offers a new version of a document, carried over from the one it supersedes", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;
    const doc = await prisma.projectDocument.findFirstOrThrow({
      select: { id: true, projectId: true, title: true, documentTypeId: true },
    });

    const rec = (await projectRecord(ctx, doc.projectId))!;
    const row = rec.collections
      .find((c) => c.key.startsWith("docs:"))!
      .rows.find((r) => r.id === doc.id)!;
    const version = (row.actions ?? []).find((a) => a.key === "version");
    expect(version, "the document row offers no new version").toBeDefined();
    expect(version!.label).toBe("New version");
    // The document's own form, not the project's.
    expect(version!.formId).toBe(doc.id);

    const form = await resolveForm(ctx, "projects/projects:newDocumentVersion", doc.id);
    expect(typeof form === "string" ? form : "ok").toBe("ok");
    if (typeof form !== "string" && "fields" in form) {
      const value = (name: string) => form.fields.find((f) => f.name === name)?.initial;
      // The chain the upload continues, and the particulars it carries over.
      expect(value("projectId")).toBe(doc.projectId);
      expect(value("supersedesId")).toBe(doc.id);
      expect(value("title")).toBe(doc.title);
      expect(value("documentTypeId")).toBe(doc.documentTypeId);
      // Only the file is new.
      expect(value("file")).toBeUndefined();
    }

    await cleanupActionSessions();
  });
});
