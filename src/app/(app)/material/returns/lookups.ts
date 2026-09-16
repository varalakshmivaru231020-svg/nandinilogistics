import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { returnableQty, roundQty } from "@/lib/material/return-caps";

export interface ReturnableIssue {
  id: string;
  issueNo: string;
  issueDate: string;
  projectCode: string;
  storeName: string;
  issuedToName: string;
  lines: Array<{
    issueItemId: string;
    name: string;
    uom: string;
    issuedQty: number;
    returnedQty: number;
    pendingQty: number;
    returnable: number;
    rate: number;
  }>;
}

/**
 * Issue slips a return can be raised against: in the actor's projects, not
 * cancelled, with something still returnable once pending returns are counted.
 * The service re-checks all of it; this only decides what the form offers.
 */
export async function returnableIssues(ctx: AuthContext, preselect: string | null): Promise<ReturnableIssue[]> {
  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };

  const include = {
    project: { select: { code: true } },
    store: { select: { name: true } },
    items: {
      include: {
        item: { select: { name: true, uom: { select: { name: true } } } },
        returnItems: {
          where: { materialReturn: { status: "PENDING" as const } },
          select: { quantity: true },
        },
      },
    },
  };

  const [recent, chosen] = await Promise.all([
    prisma.materialIssue.findMany({
      where: { ...scope, cancelledAt: null },
      orderBy: { issueDate: "desc" },
      take: 200,
      include,
    }),
    preselect
      ? prisma.materialIssue.findFirst({ where: { ...scope, id: preselect, cancelledAt: null }, include })
      : Promise.resolve(null),
  ]);

  const issues = chosen && !recent.some((i) => i.id === chosen.id) ? [chosen, ...recent] : recent;

  const people = await prisma.user.findMany({
    where: { id: { in: [...new Set(issues.map((i) => i.issuedToId))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  return issues
    .map((i) => ({
      id: i.id,
      issueNo: i.issueNo,
      issueDate: i.issueDate.toISOString(),
      projectCode: i.project.code,
      storeName: i.store.name,
      issuedToName: nameById.get(i.issuedToId) ?? "—",
      lines: i.items.map((l) => {
        const pendingQty = roundQty(l.returnItems.reduce((s, r) => s + Number(r.quantity), 0));
        const line = { issuedQty: Number(l.issuedQty), returnedQty: Number(l.returnedQty), pendingQty };
        return {
          issueItemId: l.id,
          name: l.item.name,
          uom: l.item.uom.name,
          ...line,
          returnable: returnableQty(line),
          rate: Number(l.rate),
        };
      }),
    }))
    .filter((i) => i.lines.some((l) => l.returnable > 0));
}
