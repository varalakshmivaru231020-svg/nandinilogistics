import { dateCondition, parseReportFilters } from "@/lib/reports/filters";

/**
 * Pieces shared by the Sales list filters (customers, bookings, receipts, site
 * visits, cost sheets). Pure and Prisma-free: each list's where-builder is used
 * by its page and by its export route, so a download holds exactly the rows the
 * screen was showing.
 */

export type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

/** A trimmed query parameter, or "" when absent. */
export function readParam(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

/** A page's awaited searchParams as URLSearchParams, for building export links. */
export function toSearchParams(source: Record<string, string | string[] | undefined>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(source)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) sp.set(k, value);
  }
  return sp;
}

/** The value when it is one of `allowed`, otherwise null — a hand-edited URL filters nothing. */
export function pick<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Which projects the viewer may see — the shape of `AuthContext`, kept structural so tests need no request. */
export interface ProjectScope {
  canAccessAllProjects: boolean;
  projectIds: string[];
}

/**
 * The condition on a project id: the viewer's scope, narrowed to one project
 * when asked. A project outside the scope matches nothing rather than widening
 * the list. Returns undefined when there is nothing to constrain.
 */
export function projectIdCondition(
  scope: ProjectScope,
  projectId: string,
): string | { in: string[] } | undefined {
  if (projectId) {
    if (scope.canAccessAllProjects) return projectId;
    return { in: scope.projectIds.includes(projectId) ? [projectId] : [] };
  }
  return scope.canAccessAllProjects ? undefined : { in: scope.projectIds };
}

export interface DateRange {
  from?: string;
  to?: string;
}

/** from/to as validated yyyy-mm-dd days (malformed dropped, reversed turned round). */
export function readDateRange(source: ParamSource): DateRange {
  const f = parseReportFilters(source, { project: false, date: "range" });
  return { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) };
}

/** Prisma `{gte, lt}` covering the whole of the last day, or undefined. */
export function rangeCondition(range: DateRange): { gte?: Date; lt?: Date } | undefined {
  return dateCondition(range);
}

function day(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** The range in words, e.g. "Booked 01 Apr 2026 – 30 Jun 2026", or null. */
export function describeRange(label: string, range: DateRange): string | null {
  if (range.from && range.to) return `${label} ${day(range.from)} – ${day(range.to)}`;
  if (range.from) return `${label} from ${day(range.from)}`;
  if (range.to) return `${label} up to ${day(range.to)}`;
  return null;
}

/** Joins the non-empty parts, or the fallback when nothing narrowed the list. */
export function joinFilters(parts: Array<string | null | false | undefined>, fallback: string): string {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(" · ") : fallback;
}

export function searchWords(q: string): string | null {
  return q ? `Search "${q}"` : null;
}
