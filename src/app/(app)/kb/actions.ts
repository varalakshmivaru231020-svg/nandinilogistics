"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const ArticleSchema = z.object({
  title: z.string().trim().min(3, "A title is required"),
  summary: z.string().trim().optional(),
  body: z.string().trim().min(10, "Write something useful in the body"),
  category: z.string().trim().optional(),
});

export async function createArticleAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.kb.article.create);
    const parsed = ArticleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const article = await prisma.kbArticle.create({
      data: {
        title: v.title,
        summary: v.summary || null,
        body: v.body,
        category: v.category || null,
        authorId: ctx.id,
      },
    });
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

    await prisma.kbArticle.update({
      where: { id },
      data: { title: v.title, summary: v.summary || null, body: v.body, category: v.category || null },
    });
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
