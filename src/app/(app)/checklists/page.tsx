import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ChecklistsScreen } from "./checklists-screen";

export const metadata = { title: "Checklist Management" };

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; list?: string }>;
}) {
  const ctx = await requirePermission(PERM.checklist.checklist.view);
  const { tab = "lib", category, list } = await searchParams;

  const categories = await prisma.checklistCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, code: true, name: true, description: true,
      _count: { select: { checklists: true } },
    },
  });

  const activeCategory = categories.find((c) => c.id === category) ?? categories[0] ?? null;

  const checklists = activeCategory
    ? await prisma.checklist.findMany({
        where: { categoryId: activeCategory.id },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, version: true, isActive: true,
          _count: { select: { checkpoints: true } },
        },
      })
    : [];

  const activeList = checklists.find((l) => l.id === list) ?? checklists[0] ?? null;

  const checkpoints = activeList
    ? await prisma.checklistCheckpoint.findMany({
        where: { checklistId: activeList.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, text: true },
      })
    : [];

  const runs =
    tab === "runs"
      ? await prisma.checklistRun.findMany({
          orderBy: { performedAt: "desc" },
          take: 25,
          select: {
            id: true, location: true, score: true, result: true, state: true,
            checklist: {
              select: { name: true, category: { select: { name: true } }, _count: { select: { checkpoints: true } } },
            },
            performedBy: { select: { name: true } },
          },
        })
      : [];

  // The design shows compliance for the month above the list.
  const compliance =
    runs.length === 0 ? null : Math.round((runs.reduce((n, r) => n + r.score, 0) / runs.length) * 10) / 10;

  return (
    <ChecklistsScreen
      tab={tab === "runs" ? "runs" : "lib"}
      categories={categories.map((c) => ({
        id: c.id, code: c.code, name: c.name, description: c.description,
        count: c._count.checklists,
      }))}
      activeCategoryId={activeCategory?.id ?? null}
      checklists={checklists.map((l) => ({
        id: l.id, name: l.name, version: l.version, isActive: l.isActive, checkpointCount: l._count.checkpoints,
      }))}
      activeListId={activeList?.id ?? null}
      checkpoints={checkpoints}
      runs={runs.map((r) => ({
        id: r.id,
        name: r.checklist.name,
        category: r.checklist.category.name,
        checkpoints: r.checklist._count.checkpoints,
        location: r.location,
        by: r.performedBy.name,
        score: r.score,
        result: r.result,
        state: r.state,
      }))}
      compliance={compliance}
      can={{
        createCategory: ctx.has(PERM.checklist.category.create),
        updateCategory: ctx.has(PERM.checklist.category.update),
        deleteCategory: ctx.has(PERM.checklist.category.delete),
        create: ctx.has(PERM.checklist.checklist.create),
        update: ctx.has(PERM.checklist.checklist.update),
        delete: ctx.has(PERM.checklist.checklist.delete),
      }}
    />
  );
}
