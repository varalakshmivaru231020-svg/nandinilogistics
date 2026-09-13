import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { PriceListsScreen } from "./price-lists-screen";

export const metadata = { title: "Price Lists" };

export default async function PriceListsPage() {
  const ctx = await requirePermission(PERM.unit.priceList.view);

  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };

  const [lists, projects] = await Promise.all([
    prisma.priceList.findMany({
      where: scope,
      orderBy: [{ projectId: "asc" }, { version: "desc" }],
      include: {
        project: { select: { code: true, name: true } },
        items: true,
      },
    }),
    prisma.project.findMany({
      where: ctx.canAccessAllProjects ? { status: "ACTIVE" } : { id: { in: ctx.projectIds } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Price Lists"
        description="Rate revisions carry an effective date, so a past booking keeps the rate it was sold at."
      />

      <PriceListsScreen
        lists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          version: l.version,
          isActive: l.isActive,
          effectiveFrom: l.effectiveFrom.toISOString(),
          effectiveTo: l.effectiveTo?.toISOString() ?? null,
          projectCode: l.project.code,
          projectName: l.project.name,
          baseRate: Number(l.items[0]?.baseRate ?? 0),
          floorRise: Number(l.items[0]?.floorRise ?? 0),
          plcAmount: Number(l.items[0]?.plcAmount ?? 0),
        }))}
        projects={projects}
        can={{
          create: ctx.has(PERM.unit.priceList.create),
          activate: ctx.has(PERM.unit.priceList.activate),
          export: ctx.has(PERM.unit.priceList.export),
        }}
      />
    </div>
  );
}
