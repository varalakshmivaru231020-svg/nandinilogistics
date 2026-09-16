import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * What a purchase order can be raised against. The indent prefill is not here
 * — that is specific to arriving from an indent, and only the /new route does
 * that. The drawer opens empty, as the design's does.
 */
export async function poLookups(ctx: AuthContext) {
  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, vendors, terms, items, openIndents] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectWhere, status: { in: ["PLANNING", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.vendor.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, paymentTermId: true },
    }),
    prisma.paymentTerm.findMany({
      where: { status: "ACTIVE" },
      orderBy: { days: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true, standardRate: true,
        uom: { select: { name: true } },
        taxRate: { select: { percentage: true } },
        // What the store is holding, as the design's picker reads it.
        stockBalances: { select: { quantity: true } },
      },
    }),
    // Approved indents with a purchase shortfall still to be ordered.
    prisma.indent.findMany({
      where: {
        status: "ADMIN_APPROVED",
        ...(ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } }),
      },
      orderBy: { raisedAt: "asc" },
      take: 50,
      select: { id: true, indentNo: true, purpose: true, projectId: true },
    }),
  ]);

  return {
    projects,
    vendors,
    terms,
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      uom: i.uom.name,
      onHand: i.stockBalances.reduce((n, b) => n + Number(b.quantity), 0),
      standardRate: Number(i.standardRate),
      taxPct: i.taxRate ? Number(i.taxRate.percentage) : 0,
    })),
    openIndents,
  };
}

export type PoLookups = Awaited<ReturnType<typeof poLookups>>;
