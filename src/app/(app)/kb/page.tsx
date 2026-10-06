import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ModuleStats } from "@/components/list/module-stats";
import { articleFigures } from "@/lib/metrics/figures";
import { KbScreen } from "./kb-screen";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; open?: string }>;
}) {
  const ctx = await requirePermission(PERM.kb.article.view);
  const { q = "", open } = await searchParams;

  // Without the update permission a reader only sees what is published.
  const canSeeDrafts = ctx.has(PERM.kb.article.update);

  const visible = canSeeDrafts ? {} : { isPublished: true };

  const [articles, totalArticles, statRows] = await Promise.all([
    prisma.kbArticle.findMany({
      where: {
        ...visible,
        ...(q.trim()
          ? {
              OR: [
                { title: { contains: q.trim(), mode: "insensitive" } },
                { summary: { contains: q.trim(), mode: "insensitive" } },
                { body: { contains: q.trim(), mode: "insensitive" } },
                { category: { contains: q.trim(), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        author: { select: { name: true, roles: { select: { role: { select: { name: true } } }, take: 1 } } },
        attachments: { select: { id: true, fileName: true, fileSize: true } },
      },
    }),
    prisma.kbArticle.count({ where: visible }),
    // The band reads every article the viewer may see, not the search results.
    prisma.kbArticle.findMany({
      where: visible,
      select: { isPublished: true, attachments: { select: { id: true } } },
    }),
  ]);

  return (
    <div>
      <ModuleStats figures={articleFigures(statRows)} />
      <KbScreen
        query={q}
        totalArticles={totalArticles}
        openId={open ?? null}
        articles={articles.map((a) => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          body: a.body,
          category: a.category,
          isPublished: a.isPublished,
          // The design credits the role that wrote the article, not the person.
          author: a.author?.roles[0]?.role.name ?? a.author?.name ?? "System",
          updatedAt: a.updatedAt.toISOString(),
          attachments: a.attachments,
        }))}
        can={{
          create: ctx.has(PERM.kb.article.create),
          update: ctx.has(PERM.kb.article.update),
          remove: ctx.has(PERM.kb.article.delete),
          publish: ctx.has(PERM.kb.article.publish),
          attach: ctx.has(PERM.kb.article.attach),
        }}
      />
    </div>
  );
}
