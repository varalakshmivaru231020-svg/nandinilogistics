"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { put, FileTooLargeError, UnsupportedFileTypeError } from "@/lib/storage";
import { richTextToPlain, sanitiseRichText } from "@/lib/rich-text";

const ArticleSchema = z.object({
  /** The design calls it Name; it is the article's title. */
  title: z.string().trim().min(3, "A name is required"),
  body: z.string().trim().min(10, "Write something useful in the description"),
});

/**
 * Stores the files the design's drawer attaches, turning the storage rules into
 * form errors rather than exceptions.
 */
async function attach(articleId: string, formData: FormData, uploadedById: string) {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    try {
      const stored = await put(`kb-${articleId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
      await prisma.kbAttachment.create({
        data: {
          articleId,
          storageKey: stored.key,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          uploadedById,
        },
      });
    } catch (err) {
      if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
        throw new Error(err.message);
      }
      throw err;
    }
  }
}

export async function createArticleAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.kb.article.create);
    const parsed = ArticleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const body = sanitiseRichText(v.body);
    const article = await prisma.kbArticle.create({
      data: {
        title: v.title,
        // The card shows the opening words; the design has no separate summary.
        summary: richTextToPlain(body).slice(0, 180) || null,
        body,
        authorId: ctx.id,
      },
    });
    await attach(article.id, formData, ctx.id);
    await recordAudit({
      action: "CREATE", entity: "KbArticle", entityId: article.id, userId: ctx.id,
      summary: `Published knowledge base article — ${article.title}`,
    });
    revalidatePath("/kb");
    return { id: article.id };
  });
}

export async function updateArticleAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.kb.article.update);
    const parsed = ArticleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const before = await prisma.kbArticle.findUnique({ where: { id } });
    if (!before) throw new Error("Article not found.");

    const body = sanitiseRichText(v.body);
    await prisma.kbArticle.update({
      where: { id },
      data: { title: v.title, summary: richTextToPlain(body).slice(0, 180) || null, body },
    });
    await attach(id, formData, ctx.id);
    await recordAudit({
      action: "UPDATE", entity: "KbArticle", entityId: id, userId: ctx.id,
      summary: `Updated article — ${v.title}`,
      changes: { title: { from: before.title, to: v.title } },
    });
    revalidatePath("/kb");
    return null;
  });
}

export async function deleteArticleAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.kb.article.delete);
    const article = await prisma.kbArticle.findUnique({ where: { id } });
    if (!article) throw new Error("Article not found.");

    await prisma.kbArticle.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "KbArticle", entityId: id, userId: ctx.id,
      summary: `Deleted article — ${article.title}`,
    });
    revalidatePath("/kb");
    return null;
  });
}

export async function toggleArticlePublishedAction(id: string): Promise<ActionResult<{ published: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.kb.article.publish);
    const article = await prisma.kbArticle.findUnique({ where: { id } });
    if (!article) throw new Error("Article not found.");

    const next = !article.isPublished;
    await prisma.kbArticle.update({ where: { id }, data: { isPublished: next } });
    await recordAudit({
      action: "UPDATE", entity: "KbArticle", entityId: id, userId: ctx.id,
      summary: `${next ? "Published" : "Unpublished"} article — ${article.title}`,
    });
    revalidatePath("/kb");
    return { published: next };
  });
}
