import Link from "next/link";
import { Building2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, moneyShort } from "@/lib/utils";
import { NewProjectButton } from "./new-project-button";

export const metadata = { title: "Projects" };

const STATUS_TONE = {
  PLANNING: "brand", ACTIVE: "good", ON_HOLD: "warn",
  COMPLETED: "slate", CANCELLED: "bad",
} as const;

export default async function ProjectsPage() {
  const ctx = await requirePermission(PERM.project.project.view);

  // Project-team scoping: you only see projects mapped to you.
  const where = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, types, companies, cities, managers] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        projectType: { select: { name: true } },
        city: { select: { name: true } },
        projectManager: { select: { name: true } },
        _count: { select: { units: true, phases: true, team: true } },
      },
    }),
    prisma.projectType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const showBudget = ctx.has(PERM.project.project.viewBudget);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projects"
        description={
          ctx.canAccessAllProjects
            ? "Every project on the platform."
            : "The projects you are mapped to. Everything else in the system is scoped to these."
        }
        actions={
          ctx.has(PERM.project.project.create) ? (
            <NewProjectButton types={types} companies={companies} cities={cities} managers={managers} />
          ) : null
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="No projects yet"
            description={
              ctx.canAccessAllProjects
                ? "Create the first project — every task, indent, purchase order and unit hangs off one."
                : "You are not mapped to any project yet. An administrator can map you from Administration → Users."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition hover:border-brand-300 hover:shadow">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-950">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted-500">
                        <code>{p.code}</code>
                        {p.city && ` · ${p.city.name}`}
                        {p.projectType && ` · ${p.projectType.name}`}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{p.status.replace("_", " ")}</Badge>
                  </div>

                  {p.reraNumber && (
                    <p className="mt-2 truncate text-[11px] text-muted-400" title={p.reraNumber}>
                      RERA {p.reraNumber}
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line-200 pt-3 text-center">
                    <div>
                      <dt className="text-[11px] text-muted-500">Units</dt>
                      <dd className="num text-sm font-medium text-navy-900">{p._count.units}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-500">Phases</dt>
                      <dd className="num text-sm font-medium text-navy-900">{p._count.phases}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-500">Team</dt>
                      <dd className="num text-sm font-medium text-navy-900">{p._count.team}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex items-center justify-between border-t border-line-200 pt-2 text-xs">
                    <span className="text-muted-500">
                      {p.projectManager ? `PM: ${p.projectManager.name}` : "No PM assigned"}
                    </span>
                    {showBudget && (
                      <span className="num font-medium text-navy-600">{moneyShort(p.budgetAmount)}</span>
                    )}
                  </div>

                  {p.targetDate && (
                    <p className="mt-1 text-[11px] text-muted-400">Target {formatDate(p.targetDate)}</p>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
