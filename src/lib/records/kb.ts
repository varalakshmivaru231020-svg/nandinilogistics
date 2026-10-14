import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { type RecordAction, type RecordView } from "./shared";

/**
 * One knowledge-base article, in full.
 *
 * The list shows a title and a summary; the article is the body, and reading it
 * on site is the whole point of having it. A draft is visible only to somebody
 * who may edit — the same rule the list applies — and publishing is one tap.
 */
export async function kbRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const article = await prisma.kbArticle.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, fileSize: true } },
    },
  });
  if (!article) return null;

  const canEdit = ctx.has(PERM.kb.article.update);
  // A draft is not readable by somebody who could not have written it.
  if (!article.isPublished && !canEdit) return null;

  const actions: RecordAction[] = [];
  if (canEdit) {
    actions.push({
      key: "togglePublished",
      label: article.isPublished ? "Unpublish" : "Publish",
      emphasis: article.isPublished ? "outline" : "approve",
      action: "kb/toggleArticlePublished",
      args: [id],
      remark: "none",
      confirm: article.isPublished
        ? "It comes off the list for everybody but the people who may edit it."
        : "Everybody who may read the knowledge base will see it.",
    });
  }
  if (ctx.has(PERM.kb.article.delete)) {
    actions.push({
      key: "delete",
      label: "Delete",
      emphasis: "reject",
      action: "kb/deleteArticle",
      args: [id],
      remark: "none",
      confirm: "The article and its attachments go for good.",
    });
  }

  return {
    key: "kb",
    id: article.id,
    title: article.title,
    subtitle: [article.category, article.author?.name].filter(Boolean).join(" · ") || null,
    pills: [
      article.isPublished
        ? { label: "Published", tone: "good" }
        : { label: "Draft", tone: "draft" },
    ],
    sections: [
      {
        label: "The article",
        fields: [
          { label: "Category", value: article.category },
          { label: "Written by", value: article.author?.name ?? null },
          { label: "Updated", value: article.updatedAt.toISOString(), format: "date" },
          { label: "Summary", value: article.summary, wide: true },
          // The whole body, because reading it is what this screen is for.
          { label: "Body", value: article.body, wide: true },
        ],
      },
    ],
    collections: [
      {
        key: `files:${id}`,
        label: `Attachments · ${article.attachments.length}`,
        rows: article.attachments.map((a) => ({
          id: a.id,
          title: a.fileName,
          trailing: `${Math.max(1, Math.round(a.fileSize / 1024))} KB`,
        })),
        emptyMessage: "No attachments.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
