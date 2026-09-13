import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { cn, moneyShort } from "@/lib/utils";
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, projectListWhere, readProjectListParams,
} from "@/lib/projects/list-filters";
import { NewProjectButton } from "./new-project-button";

export const metadata = { title: "Project Management" };

const STATUS_TONE = {
  PLANNING: "brand", ACTIVE: "good", ON_HOLD: "warn",
  COMPLETED: "navy", CANCELLED: "bad",
} as const;

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.project.project.view);
  const raw = await searchParams;
  const listParams = readProjectListParams(raw);
  const filtered = Boolean(listParams.q || listParams.status);

  // Project-team scoping (you only see projects mapped to you), then the
  // search and status filter — the same function the export uses.
  const where = projectListWhere(ctx, listParams);

  // The current query, for the export links.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) query.set(k, value);
  }

  const [projects, types, companies, cities, managers] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        projectType: { select: { name: true } },
        city: { select: { name: true } },
        projectManager: { select: { name: true } },
        activities: { select: { progressPct: true } },
        _count: { select: { units: true, phases: true, team: true } },
      },
    }),
    prisma.projectType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const showBudget = ctx.has(PERM.project.project.viewBudget);
  const totalUnits = projects.reduce((s, p) => s + p._count.units, 0);
  const totalTowers = projects.reduce((s, p) => s + p.totalTowers, 0);

  return (
    <div className="animate-fade-up mx-auto max-w-[1400px]">
      {/* Summary line, as in the design */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-600">
          {projects.length} project{projects.length === 1 ? "" : "s"} · {totalTowers} tower
          {totalTowers === 1 ? "" : "s"} · {totalUnits.toLocaleString("en-IN")} units under management
          {!ctx.canAccessAllProjects && " · scoped to your mapping"}
        </p>
        {ctx.has(PERM.project.project.create) && (
          <NewProjectButton types={types} companies={companies} cities={cities} managers={managers} />
        )}
      </div>

      <ListToolbar
        searchPlaceholder="Search code, name, city, RERA or manager…"
        filters={[
          {
            name: "status",
            label: "Status",
            allLabel: "All statuses",
            options: PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] })),
          },
        ]}
        count={projects.length}
      >
        {ctx.has(PERM.project.project.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/projects/projects/export", format, query)}
            disabled={projects.length === 0}
          />
        )}
      </ListToolbar>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title={filtered ? "No projects match" : "No projects yet"}
            description={
              filtered
                ? "Nothing matches this search and status. Clear the filters to see every project."
                : ctx.canAccessAllProjects
                ? "Create the first project — every task, indent, purchase order and unit hangs off one."
                : "You are not mapped to any project yet. An administrator can map you from Administration → Users."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Project", "Type · RERA", "Scale", "Project manager", "Progress", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                      h === "Actions" ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const pct = p.activities.length
                  ? Math.round(p.activities.reduce((s, a) => s + a.progressPct, 0) / p.activities.length)
                  : 0;
                return (
                  <tr key={p.id} className="border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint">
                    <td className="px-4 py-3.5">
                      <Link href={`/projects/${p.id}`} className="text-[13.5px] font-bold text-navy-950 hover:text-brand-500">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                        {p.code}
                        {p.city && ` · ${p.city.name}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[12.5px] font-semibold text-navy-600">
                        {p.projectType?.name ?? "—"}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-muted-400" title={p.reraNumber ?? ""}>
                        {p.reraNumber ?? "RERA not recorded"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-semibold text-navy-600">
                      {[
                        p.totalTowers > 0 && `${p.totalTowers} tower${p.totalTowers === 1 ? "" : "s"}`,
                        p.totalFloors > 0 && `${p.totalFloors} fl`,
                        `${p._count.units} units`,
                      ].filter(Boolean).join(" · ")}
                    </td>
                    <td className="px-4 py-3.5">
                      {p.projectManager ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: "linear-gradient(140deg,#0089C9,#2F308C)" }}
                          >
                            {initials(p.projectManager.name)}
                          </span>
                          <span className="text-[12.5px] font-semibold text-navy-600">
                            {p.projectManager.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] font-medium text-warn-700">Unassigned</span>
                      )}
                      <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                        {p._count.team} on the team
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#EDF0F8]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, pct)}%`,
                              background: "linear-gradient(90deg,#0089C9,#2F308C)",
                            }}
                          />
                        </div>
                        <span className="num w-[34px] text-[12px] font-bold text-brand-500">{pct}%</span>
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-muted-400">
                        {p.activities.length} scheduled activit{p.activities.length === 1 ? "y" : "ies"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STATUS_TONE[p.status]}>{p.status.replace("_", " ")}</Badge>
                      {showBudget && (
                        <div className="num mt-1 text-[11px] font-semibold text-muted-500">
                          {moneyShort(p.budgetAmount)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/projects/${p.id}`}
                        title="Open"
                        className="inline-grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-surface-hover hover:text-navy-900"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
