import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { IssueForm } from "./issue-form";

export const metadata = { title: "Issue Material" };

export default async function NewIssuePage() {
  const ctx = await requirePermission(PERM.material.issue.create);

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
    include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Issue material"
        description="Moves stock out of the store and onto a work package, valued at the store's weighted-average rate."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/issues" className="hover:text-brand-600">Material Issues</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <IssueForm
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          workPackages: p.phases.flatMap((ph) => ph.workPackages),
        }))}
        stores={stores}
        recipients={recipients.map((r) => ({
          id: r.id,
          name: r.name,
          designation: r.designation?.name ?? null,
        }))}
        stock={balances.map((b) => ({
          itemId: b.item.id,
          storeId: b.storeId,
          code: b.item.code,
          name: b.item.name,
          uom: b.item.uom.code,
          available: Number(b.quantity),
          avgRate: Number(b.avgRate),
        }))}
        canViewValue={ctx.has(PERM.material.stock.viewValuation)}
      />
    </div>
  );
}
