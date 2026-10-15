import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { articleEmpty, articleScreenRow } from "@/lib/screens/rows/exec";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Knowledge base articles.
 *
 * The one rule carried over from the screen: **without `kb.article.update` a
 * reader sees only what is published.** A draft is somebody's unfinished
 * writing, and a list that leaked it would be the only place in the app that
 * did.
 *
 * The body is searched but not returned — it is long, and a list does not need
 * it. The summary is what a row shows.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.kb.article.view, PERM.kb.article.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const q = params.get("q")?.trim();
  const category = params.get("category")?.trim();

  const visible = ctx.has(PERM.kb.article.update) ? {} : { isPublished: true };

  const articles = await prisma.kbArticle.findMany({
    where: {
      ...visible,
      ...(category ? { category: { equals: category, mode: "insensitive" as const } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { summary: { contains: q, mode: "insensitive" as const } },
              { body: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, summary: true, category: true, isPublished: true, updatedAt: true,
      author: {
        select: { name: true, roles: { take: 1, select: { role: { select: { name: true } } } } },
      },
      _count: { select: { attachments: true } },
    },
  });

  const { rows, note } = capRows(articles);

  /* The screen, for the app: the article card, credited to the role that wrote
   * it as the design credits it. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((a) =>
        articleScreenRow({
          id: a.id,
          title: a.title,
          summary: a.summary ?? "",
          author: a.author?.roles[0]?.role.name ?? a.author?.name ?? "System",
          updatedAt: a.updatedAt,
          attachments: a._count.attachments,
          category: a.category,
        }),
      ),
      empty: articleEmpty(Boolean(gate.params.get("q"))),
    };
  }

  const columns: ReportColumn[] = [
    { key: "title", header: "Title" },
    { key: "category", header: "Category" },
    { key: "summary", header: "Summary" },
    { key: "author", header: "By" },
    { key: "state", header: "State" },
    { key: "attachments", header: "Files", align: "right", format: "number" },
    { key: "updatedAt", header: "Updated", format: "date" },
  ];

  return exportResponse({
    ctx,
    screen,
    params: gate.params,
    format: gate.format,
    title: "Knowledge Base",
    entity: "KbArticle",
    filters: [
      q ? `Matching “${q}”` : null,
      category ? `Category ${category}` : null,
      ctx.has(PERM.kb.article.update) ? null : "Published only",
    ].filter(Boolean).join(" · ") || "Every article",
    result: {
      columns,
      rows: rows.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category ?? "",
        summary: a.summary ?? "",
        // The design credits the role that wrote it, not the person.
        author: a.author?.roles[0]?.role.name ?? a.author?.name ?? "System",
        state: a.isPublished ? "Published" : "Draft",
        attachments: a._count.attachments,
        updatedAt: a.updatedAt,
      })),
      summary: [{ label: "Articles", value: note }],
      emptyMessage: "No articles match these filters.",
    },
  });
}
