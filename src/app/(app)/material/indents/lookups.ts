import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * The projects and items an indent can be raised against, with what the store
 * is holding — the builder checks each line against live stock as it is typed,
 * which is what the design promises.
 */
export async function indentLookups(ctx: AuthContext) {
  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, items, balances] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectWhere, status: { in: ["PLANNING", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true,
        phases: { select: { workPackages: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.item.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true,
        standardRate: true,
        uom: { select: { code: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.stockBalance.groupBy({ by: ["itemId"], _sum: { quantity: true } }),
  ]);

  const onHand = new Map(balances.map((b) => [b.itemId, Number(b._sum.quantity ?? 0)]));

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      workPackages: p.phases.flatMap((ph) => ph.workPackages),
    })),
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      uom: i.uom.code,
      category: i.category.name,
      standardRate: Number(i.standardRate),
      onHand: onHand.get(i.id) ?? 0,
    })),
  };
}

export type IndentLookups = Awaited<ReturnType<typeof indentLookups>>;
