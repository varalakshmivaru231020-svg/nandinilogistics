"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { put, remove, FileTooLargeError, UnsupportedFileTypeError } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Uploads a project document.
 *
 * Superseding an existing document creates a new version rather than
 * overwriting it — the old file stays readable, which is the point of a
 * repository that has to stand up years later.
 */
export async function uploadDocumentAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string; version: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.document.upload);
    assertProjectAccess(ctx, projectId);

    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");

    const title = String(formData.get("title") ?? "").trim();
    const documentTypeId = String(formData.get("documentTypeId") ?? "").trim();
    const supersedesId = String(formData.get("supersedesId") ?? "").trim() || null;
    const access = String(formData.get("access") ?? "").trim() || null;

    if (!title) throw new Error("Give the document a title.");
    if (!documentTypeId) throw new Error("Choose a document type.");

    const bytes = Buffer.from(await file.arrayBuffer());

    let stored;
    try {
      stored = await put(`project-${projectId}`, file.name, bytes, file.type);
    } catch (err) {
      // Surface the storage rules as ordinary form errors.
      if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
        throw new Error(err.message);
      }
      throw err;
    }

    // A superseding upload continues the version chain.
    let version = 1;
    if (supersedesId) {
      const previous = await prisma.projectDocument.findUnique({
        where: { id: supersedesId },
        select: { version: true, projectId: true },
      });
      if (!previous || previous.projectId !== projectId) {
        await remove(stored.key);
        throw new Error("The document being superseded does not belong to this project.");
      }
      version = previous.version + 1;
    }

    const document = await prisma.projectDocument.create({
      data: {
        projectId,
        documentTypeId,
        title,
        storageKey: stored.key,
        fileName: file.name,
        fileSize: stored.size,
        mimeType: stored.mimeType,
        checksum: stored.checksum,
        version,
        supersedesId,
        access,
        uploadedById: ctx.id,
      },
    });

    await recordAudit({
      action: "CREATE",
      entity: "ProjectDocument",
      entityId: document.id,
      userId: ctx.id,
      projectId,
      summary:
        `Uploaded "${title}" (${file.name}, ${(stored.size / 1024).toFixed(0)} KB)` +
        (supersedesId ? ` as version ${version}` : ""),
    });

    revalidatePath(`/projects/${projectId}`);
    return { id: document.id, version };
  });
}

export async function deleteDocumentAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.document.delete);

    const document = await prisma.projectDocument.findUnique({
      where: { id },
      include: { _count: { select: { versions: true } } },
    });
    if (!document) throw new Error("Document not found.");
    assertProjectAccess(ctx, document.projectId);

    if (document._count.versions > 0) {
      throw new Error(
        "A later version supersedes this document, so it cannot be deleted — the chain has to stay intact.",
      );
    }

    await prisma.projectDocument.delete({ where: { id } });
    await remove(document.storageKey);

    await recordAudit({
      action: "DELETE", entity: "ProjectDocument", entityId: id, userId: ctx.id,
      projectId: document.projectId,
      summary: `Deleted document "${document.title}" (v${document.version})`,
    });

    revalidatePath(`/projects/${document.projectId}`);
    return null;
  });
}

/**
 * Corrects a document's own record — its title, its kind and who may open it —
 * without touching the stored file. A new file is a new version, not an edit.
 */
export async function updateDocumentAction(
  id: string,
  input: { title: string; documentTypeId: string; access: string },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.document.upload);
    const doc = await prisma.projectDocument.findUnique({
      where: { id },
      select: { id: true, projectId: true, title: true },
    });
    if (!doc) throw new Error("Document not found.");
    assertProjectAccess(ctx, doc.projectId);

    const title = input.title.trim();
    if (!title) throw new Error("Give the document a title.");
    if (!input.documentTypeId) throw new Error("Choose a document type.");

    await prisma.projectDocument.update({
      where: { id },
      data: { title, documentTypeId: input.documentTypeId, access: input.access.trim() || null },
    });
    await recordAudit({
      action: "UPDATE", entity: "ProjectDocument", entityId: id, userId: ctx.id, projectId: doc.projectId,
      summary: `Updated the record for "${doc.title}"`,
    });
    revalidatePath(`/projects/${doc.projectId}`);
    return null;
  });
}
