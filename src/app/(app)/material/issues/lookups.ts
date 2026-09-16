import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * What an issue slip can be raised against. Shared by the full /new page and
 * the drawer the list opens, so both offer the same options.
 */
export async function issueLookups(ctx: AuthContext) {
  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, stores, recipients] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectWhere, status: { in: ["PLANNING", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true,
        phases: { select: { workPackages: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.store.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projectId: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: { select: { name: true } } },
    }),
  ]);

  // Only items that actually have stock can be issued.
  const balances = await prisma.stockBalance.findMany({
    where: { quantity: { gt: 0 } },
    include: { item: { select: { id: true, code: true, name: true, uom: { select: { name: true } } } } },
  });

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      workPackages: p.phases.flatMap((ph) => ph.workPackages),
    })),
    stores,
    recipients: recipients.map((r) => ({
      id: r.id,
      name: r.name,
      designation: r.designation?.name ?? null,
    })),
    stock: balances.map((b) => ({
      itemId: b.item.id,
      storeId: b.storeId,
      code: b.item.code,
      name: b.item.name,
      uom: b.item.uom.name,
      available: Number(b.quantity),
      avgRate: Number(b.avgRate),
    })),
  };
}

export type IssueLookups = Awaited<ReturnType<typeof issueLookups>>;
