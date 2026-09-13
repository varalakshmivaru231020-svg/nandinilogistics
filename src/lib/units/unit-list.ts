import type { Prisma, UnitStatus } from "@prisma/client";

import type { ReportColumn } from "@/lib/reports/types";

/**
 * The unit list's filters — search, status, project, block, unit type — as one
 * function, used by the Units screen and by its export, so a download holds
 * exactly the units the screen was showing, within the same project scoping.
 */

export const UNIT_STATUSES = ["AVAILABLE", "HELD", "BOOKED", "AGREEMENT", "REGISTERED", "BLOCKED"] as const;

export interface UnitListParams {
  q: string;
  status: string;
  project: string;
  block: string;
  type: string;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const v = source[key];
  return Array.isArray(v) ? v[0] : v;
}

export function readUnitListParams(source: ParamSource): UnitListParams {
  return {
    q: read(source, "q") ?? "",
    status: read(source, "status") ?? "all",
    project: read(source, "project") ?? "all",
    block: read(source, "block") ?? "all",
    type: read(source, "type") ?? "all",
  };
}

/** Who is looking: every project, or only the ones mapped to them. */
export interface ProjectScope {
  canAccessAllProjects: boolean;
  projectIds: string[];
}

const chosen = (v: string) => Boolean(v) && v !== "all";

/**
 * The where clause for the list. A project filter can only narrow the caller's
 * scope, never widen it: naming a project one is not mapped to matches nothing.
 */
export function unitListWhere(scope: ProjectScope, p: UnitListParams): Prisma.UnitWhereInput {
  const q = p.q.trim();
  const status = (UNIT_STATUSES as readonly string[]).includes(p.status) ? (p.status as UnitStatus) : null;

  let projectId: Prisma.UnitWhereInput["projectId"] | undefined;
  if (chosen(p.project)) {
    projectId = scope.canAccessAllProjects || scope.projectIds.includes(p.project)
      ? p.project
      : { in: [] };
  } else if (!scope.canAccessAllProjects) {
    projectId = { in: scope.projectIds };
  }

  return {
    ...(projectId !== undefined ? { projectId } : {}),
    ...(q ? { unitNumber: { contains: q, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
    ...(chosen(p.block) ? { blockId: p.block } : {}),
    ...(chosen(p.type) ? { unitTypeId: p.type } : {}),
  };
}

/** The filters in words, for the heading of an export. */
export function describeUnitFilters(
  p: UnitListParams,
  names: { project?: string | null; block?: string | null; type?: string | null },
): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    (UNIT_STATUSES as readonly string[]).includes(p.status) ? `Status ${p.status.toLowerCase()}` : null,
    names.project ? `Project ${names.project}` : null,
    names.block ? `Block ${names.block}` : null,
    names.type ? `Type ${names.type}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All units in view";
}

/**
 * Export headers. Where a value can go back in, the header is the import's
 * own label, so an edited export imports cleanly. Carpet and built-up area are
 * shown only to those who may see pricing inputs, as on the screen.
 */
export function unitExportColumns(showAreas: boolean): ReportColumn[] {
  return [
    { key: "project", header: "Project" },
    { key: "block", header: "Block" },
    { key: "unitNumber", header: "Unit number" },
    { key: "unitType", header: "Unit type" },
    { key: "floorNumber", header: "Floor", align: "right", format: "number" },
    ...(showAreas
      ? [
          { key: "carpetArea", header: "Carpet area", align: "right", format: "qty" } as ReportColumn,
          { key: "builtUpArea", header: "Built-up area", align: "right", format: "qty" } as ReportColumn,
        ]
      : []),
    { key: "superBuiltUpArea", header: "Super built-up area", align: "right", format: "qty" },
    { key: "facing", header: "Facing" },
    { key: "plcTag", header: "PLC tag" },
    { key: "parkingSlots", header: "Parking slots", align: "right", format: "number" },
    { key: "status", header: "Status" },
  ];
}
