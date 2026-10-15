import Link from "next/link";
import { Building2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ModuleStats } from "@/components/list/module-stats";
import { projectFigures } from "@/lib/metrics/figures";
import { projectEmpty, PROJECT_ROW_LABEL, PROJECT_ROW_TONE } from "@/lib/screens/rows/exec";
import {
  PROJECT_STATUSES, projectFiltersApplied, projectListWhere,
  readProjectListParams,
} from "@/lib/projects/list-filters";
import { NewProjectButton } from "./new-project-button";

export const metadata = { title: "Project Management" };

/** The design writes Ongoing · Planned · On Hold · Completed. */
// The same words and tones the phone's row is given.
const STATUS_LABEL = PROJECT_ROW_LABEL;
const STATUS_TONE = PROJECT_ROW_TONE;

/** The design tints each manager's initials from a four-colour palette. */
const AVATAR_COLOURS = ["#0089C9", "#2F308C", "#1F9D66", "#E8A13A"];

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
  const filtered = projectFiltersApplied(listParams);

  // Project-team scoping (you only see projects mapped to you), then the
  // search and status filter — the same function the export uses.
  const where = projectListWhere(ctx, listParams);

  // The dropdowns offer what the projects in scope actually carry, so a filter
  // never lists a choice that finds nothing.
  const inScope = projectListWhere(ctx, { q: "", status: "", type: "", city: "", manager: "" });

  const nowMs = new Date().getTime();

  const [projects, statRows, types, cities, managers] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        projectType: { select: { name: true } },
        city: { select: { name: true } },
        projectManager: { select: { name: true } },
        activities: { select: { status: true } },
        _count: { select: { units: true, phases: true, team: true } },
      },
    }),
    // The band reads the whole module, not the filtered page: a dashboard that
    // moves every time somebody types in the search box is not a dashboard.
    prisma.project.findMany({
      where: inScope,
      select: {
        status: true, targetDate: true, actualEndDate: true,
        activities: { select: { status: true } },
        _count: { select: { units: true } },
      },
    }),
    prisma.projectType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.city.findMany({
      where: { projects: { some: inScope } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { managedProjects: { some: inScope } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalUnits = projects.reduce((s, p) => s + p._count.units, 0);
  const totalTowers = projects.reduce((s, p) => s + p.totalTowers, 0);

  return (
    <div className="animate-fade-up">
      {/* Summary line, as in the design */}
      <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-600">
          {projects.length} project{projects.length === 1 ? "" : "s"} · {totalTowers} tower
          {totalTowers === 1 ? "" : "s"} · {totalUnits.toLocaleString("en-IN")} units under management
          {!ctx.canAccessAllProjects && " · scoped to your mapping"}
        </p>
        {ctx.has(PERM.project.project.create) && (
          <NewProjectButton types={types} />
        )}
      </div>

      <ModuleStats
        figures={projectFigures(
          statRows.map((p) => ({
            status: p.status,
            targetDate: p.targetDate,
            actualEndDate: p.actualEndDate,
            units: p._count.units,
            activities: p.activities,
          })),
          nowMs,
        )}
      />

      <ListToolbar
        searchPlaceholder="Search project name, code, RERA number, city or manager…"
        filters={[
          {
            name: "status",
            label: "Status",
            allLabel: "All statuses",
            options: PROJECT_STATUSES.map((v) => ({ value: v, label: STATUS_LABEL[v] })),
          },
          {
            name: "type",
            label: "Type",
            allLabel: "All types",
            options: types.map((t) => ({ value: t.id, label: t.name })),
          },
          {
            name: "city",
            label: "City",
            allLabel: "All cities",
            options: cities.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "manager",
            label: "Manager",
            allLabel: "All managers",
            options: managers.map((m) => ({ value: m.id, label: m.name })),
          },
        ]}
        count={projects.length}
        countNoun="project"
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title={projectEmpty(filtered).title}
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
              {projects.map((p, i) => {
                // Progress is how much of the plan is closed, the same measure the
                // schedule's own category bars use.
                const pct = p.activities.length
                  ? Math.round(
                      (p.activities.filter((a) => a.status === "COMPLETED").length / p.activities.length) * 100,
                    )
                  : 0;
                return (
                  <tr key={p.id} className="border-b border-line-150 last:border-0 hover:bg-surface-tint">
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
                            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: AVATAR_COLOURS[i % AVATAR_COLOURS.length] }}
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
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-track">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: "linear-gradient(90deg,#0089C9,#5BC8F2)",
                            }}
                          />
                        </div>
                        <span className="num w-[34px] text-[12px] font-bold text-brand-500">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-4 py-3.5" />
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
