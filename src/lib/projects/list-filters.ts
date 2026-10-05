import type { Prisma, ProjectStatus } from "@prisma/client";

import { dateCondition, parseReportFilters, type ReportFilters } from "@/lib/reports/filters";

/**
 * The Projects list and the Site Progress diary — search, filters and project
 * scoping — as pure functions shared by each screen and its export, so a
 * download holds exactly the rows the screen was showing.
 */

export const PROJECT_STATUSES = [
  "PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED",
] as const satisfies readonly ProjectStatus[];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CANCELLED: "Cancelled",
};

/** Who may see which projects, and which one they have chosen to work in. */
export interface ProjectScope {
  canAccessAllProjects: boolean;
  projectIds: string[];
  /** The chosen workspace, or null for all of them. A view filter, not access. */
  workspaceProjectId?: string | null;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

/* --------------------------------- Projects -------------------------------- */

export interface ProjectListParams {
  q: string;
  /** A ProjectStatus, or "" for every status. */
  status: string;
  /** Ids, or "" for every one. The screen offers a dropdown per parameter. */
  type: string;
  city: string;
  manager: string;
}

export function readProjectListParams(source: ParamSource): ProjectListParams {
  const status = read(source, "status");
  return {
    q: read(source, "q"),
    // A status that is not a status (a hand-edited URL) filters nothing rather
    // than reaching the database as an invalid enum.
    status: (PROJECT_STATUSES as readonly string[]).includes(status) ? status : "",
    type: read(source, "type"),
    city: read(source, "city"),
    manager: read(source, "manager"),
  };
}

/** Whether anything at all narrows the list — what the empty state asks. */
export function projectFiltersApplied(p: ProjectListParams): boolean {
  return Boolean(p.q.trim() || p.status || p.type || p.city || p.manager);
}

export function projectListWhere(scope: ProjectScope, p: ProjectListParams): Prisma.ProjectWhereInput {
  const q = p.q.trim();
  return {
    // Project-team scoping: you only see projects mapped to you. A chosen
    // workspace narrows that to the one project being worked in.
    ...(scope.workspaceProjectId
      ? { id: scope.workspaceProjectId }
      : scope.canAccessAllProjects
        ? {}
        : { id: { in: scope.projectIds } }),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { reraNumber: { contains: q, mode: "insensitive" } },
            { city: { is: { name: { contains: q, mode: "insensitive" } } } },
            { projectManager: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(p.status ? { status: p.status as ProjectStatus } : {}),
    // An id that matches nothing finds nothing, which is the honest answer to
    // a filter for something that is not there.
    ...(p.type ? { projectTypeId: p.type } : {}),
    ...(p.city ? { cityId: p.city } : {}),
    ...(p.manager ? { projectManagerId: p.manager } : {}),
  };
}

export function describeProjectFilters(p: ProjectListParams, scope: ProjectScope): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    p.status ? `Status ${PROJECT_STATUS_LABEL[p.status as ProjectStatus].toLowerCase()}` : null,
    // Ids are not worth printing; that one is set is.
    p.type ? "Type filtered" : null,
    p.city ? "City filtered" : null,
    p.manager ? "Manager filtered" : null,
    scope.canAccessAllProjects ? null : "Your mapped projects",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All projects";
}

/* ------------------------------ Site progress ------------------------------ */

export interface ProgressListParams {
  q: string;
  /** Project id, date range as inclusive yyyy-mm-dd — validated by parseReportFilters. */
  filters: ReportFilters;
}

export function readProgressListParams(source: ParamSource): ProgressListParams {
  return {
    q: read(source, "q"),
    filters: parseReportFilters(source, { project: true, date: "Log date" }),
  };
}

/**
 * @param ownership `{}` for someone who may see every log, `{ loggedById }` otherwise
 */
export function progressLogWhere(
  scope: ProjectScope,
  ownership: { loggedById?: string },
  p: ProgressListParams,
): Prisma.SiteProgressLogWhereInput {
  const q = p.q.trim();
  const logDate = dateCondition(p.filters);
  const and: Prisma.SiteProgressLogWhereInput[] = [];

  // Scoping and the project filter are separate conditions, so choosing a
  // project one is not mapped to finds nothing rather than widening the scope.
  if (scope.workspaceProjectId) and.push({ projectId: scope.workspaceProjectId });
  else if (!scope.canAccessAllProjects) and.push({ projectId: { in: scope.projectIds } });
  if (p.filters.projectId) and.push({ projectId: p.filters.projectId });
  if (logDate) and.push({ logDate });
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { weather: { contains: q, mode: "insensitive" } },
        { loggedBy: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return { ...ownership, ...(and.length ? { AND: and } : {}) };
}
