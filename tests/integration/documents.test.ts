import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

process.env.STORAGE_DIR = join(tmpdir(), `nn-docs-test-${Date.now()}`);

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

import { actAs, actAsNobody, cleanupActionSessions, bindCookieBox } from "./action-harness";
import { prisma, demoProject } from "./helpers";

import * as docActions from "@/app/(app)/projects/[id]/documents/actions";
import { storageRoot, get } from "@/lib/storage";

bindCookieBox(cookieBox);

function pdf(content: string): File {
  return new File([content], "drawing.pdf", { type: "application/pdf" });
}

describe("project documents", () => {
  let projectId: string;
  let documentTypeId: string;
  const created: string[] = [];

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;
    const type = await prisma.documentType.findFirstOrThrow({ where: { status: "ACTIVE" } });
    documentTypeId = type.id;
  });

  afterAll(async () => {
    await prisma.projectDocument.deleteMany({ where: { id: { in: created } } });
    await cleanupActionSessions();
    await rm(storageRoot(), { recursive: true, force: true });
    await prisma.$disconnect();
  });

  function form(over: Record<string, string | File> = {}) {
    const fd = new FormData();
    fd.set("title", "Structural drawing");
    fd.set("documentTypeId", documentTypeId);
    fd.set("file", pdf("%PDF-1.7 original"));
    for (const [k, v] of Object.entries(over)) fd.set(k, v);
    return fd;
  }

  it("refuses an unauthenticated upload", async () => {
    actAsNobody();
    const res = await docActions.uploadDocumentAction(projectId, form());
    expect(res.ok).toBe(false);
  });

  it("refuses a user without the upload permission", async () => {
    await actAs("sales@nninfra.example");
    const res = await docActions.uploadDocumentAction(projectId, form());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("project.document.upload");
  });

  it("stores the file and records it against the project", async () => {
    await actAs("pm@nninfra.example");
    const res = await docActions.uploadDocumentAction(projectId, form());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    created.push(res.data.id);

    const doc = await prisma.projectDocument.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(doc.version).toBe(1);
    expect(doc.checksum).toBeTruthy();
    expect(await get(doc.storageKey)).toBeInstanceOf(Buffer);
  });

  it("never stores the file under its uploaded name", async () => {
    const doc = await prisma.projectDocument.findUniqueOrThrow({ where: { id: created[0] } });
    expect(doc.storageKey).not.toContain("drawing");
    expect(doc.fileName).toBe("drawing.pdf");
  });

  it("rejects a file type that is not on the allow list", async () => {
    await actAs("pm@nninfra.example");
    const fd = form({ file: new File(["#!/bin/sh"], "evil.sh", { type: "application/x-sh" }) });
    const res = await docActions.uploadDocumentAction(projectId, fd);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot be uploaded/i);
  });

  it("requires a title and a document type", async () => {
    await actAs("pm@nninfra.example");
    expect((await docActions.uploadDocumentAction(projectId, form({ title: "  " }))).ok).toBe(false);
    expect((await docActions.uploadDocumentAction(projectId, form({ documentTypeId: "" }))).ok).toBe(false);
  });

  it("creates a new version instead of overwriting", async () => {
    await actAs("pm@nninfra.example");
    const fd = form({ file: pdf("%PDF-1.7 revised"), supersedesId: created[0] });
    const res = await docActions.uploadDocumentAction(projectId, fd);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    created.push(res.data.id);
    expect(res.data.version).toBe(2);
  });

  it("leaves the earlier version readable", async () => {
    const original = await prisma.projectDocument.findUniqueOrThrow({ where: { id: created[0] } });
    const bytes = await get(original.storageKey);
    expect(bytes.toString()).toContain("original");
  });

  it("refuses to delete a document a later version supersedes", async () => {
    await actAs("owner@nninfra.example");
    const res = await docActions.deleteDocumentAction(created[0]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/supersedes/i);
  });

  it("deletes the newest version and removes the stored bytes", async () => {
    const newest = await prisma.projectDocument.findUniqueOrThrow({ where: { id: created[1] } });
    await actAs("owner@nninfra.example");

    const res = await docActions.deleteDocumentAction(created[1]);
    expect(res.ok).toBe(true);

    await expect(get(newest.storageKey)).rejects.toThrow();
    created.splice(1, 1);
  });

  it("writes an audit row for every upload", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "ProjectDocument", entityId: created[0], action: "CREATE" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.summary).toContain("Structural drawing");
  });
});
