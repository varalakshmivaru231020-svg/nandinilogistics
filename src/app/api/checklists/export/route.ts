import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * The checklist library — every checklist, with its category and how many
 * points are on it.
 *
 * The screen navigates it a category at a time, because that is how somebody
 * edits one. A list wants the whole library at once: on a phone this is what a
 * supervisor scrolls to find the checklist for the work in front of them.
 *
 * `?category=<id>` narrows it, and `?active=yes|no` picks out the versions in
 * use — a checklist is versioned, and only one version of it is current.
 */
export async function GET(request: Request) {
  const gate = await exportGate(
    request,
    PERM.checklist.checklist.view,
    PERM.checklist.checklist.export,
  );
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const category = params.get("category")?.trim();
  const active = params.get("active")?.trim();
  const q = params.get("q")?.trim();

  const checklists = await prisma.checklist.findMany({
    where: {
      ...(category ? { categoryId: category } : {}),
      ...(active === "yes" ? { isActive: true } : active === "no" ? { isActive: false } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { category: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { version: "desc" }],
    select: {
      id: true, name: true, version: true, isActive: true, updatedAt: true,
      category: { select: { code: true, name: true } },
      _count: { select: { checkpoints: true, runs: true } },
    },
  });

  const { rows, note } = capRows(checklists);

  const columns: ReportColumn[] = [
    { key: "name", header: "Checklist" },
    { key: "category", header: "Category" },
    { key: "version", header: "Version", align: "right", format: "number" },
    { key: "checkpoints", header: "Points", align: "right", format: "number" },
    { key: "runs", header: "Times run", align: "right", format: "number" },
    { key: "state", header: "State" },
    { key: "updatedAt", header: "Last changed", format: "date" },
  ];

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Checklists",
    entity: "Checklist",
    filters: [
      q ? `Matching “${q}”` : null,
      category ? "One category" : null,
      active === "yes" ? "In use" : active === "no" ? "Retired" : null,
    ].filter(Boolean).join(" · ") || "The whole library",
    result: {
      columns,
      rows: rows.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category.name,
        categoryCode: c.category.code,
        version: c.version,
        checkpoints: c._count.checkpoints,
        runs: c._count.runs,
        state: c.isActive ? "In use" : "Retired",
        updatedAt: c.updatedAt,
      })),
      summary: [{ label: "Checklists", value: note }],
      emptyMessage: "No checklists match these filters.",
    },
  });
}
