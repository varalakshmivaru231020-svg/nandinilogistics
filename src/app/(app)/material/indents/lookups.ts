import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * The projects and items an indent can be raised against. Shared by the full
 * /new page and the drawer the list screen opens, so both offer exactly the
 * same options and there is one query to keep correct.
 */
export async function indentLookups(ctx: AuthContext) {
  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, items] = await Promise.all([
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
  ]);

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
    })),
  };
}

export type IndentLookups = Awaited<ReturnType<typeof indentLookups>>;
