import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { IndentForm } from "./indent-form";

export const metadata = { title: "Raise Indent" };

export default async function NewIndentPage() {
  const ctx = await requirePermission(PERM.material.indent.create);

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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Raise an indent"
        description="Item, quantity, required-by date and the activity it is for — captured where the work is, not reconstructed later."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/indents" className="hover:text-brand-600">Indents</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <IndentForm
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          workPackages: p.phases.flatMap((ph) => ph.workPackages),
        }))}
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          uom: i.uom.code,
          category: i.category.name,
          standardRate: Number(i.standardRate),
        }))}
        canSubmit={ctx.has(PERM.material.indent.submit)}
      />
    </div>
  );
}
