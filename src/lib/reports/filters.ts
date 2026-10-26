/**
 * Report filters — company and date range — as they travel in the URL.
 *
 * Pure and Prisma-free: the report page, the export route and the filter bar
 * all read and write filters through here, so a link copied from the screen
 * exports exactly what the screen shows.
 */

export interface ReportFilters {
  companyId?: string;
  /** Inclusive, as yyyy-mm-dd. */
  from?: string;
  /** Inclusive, as yyyy-mm-dd. */
  to?: string;
}

export interface ReportFilterSpec {
  /** Whether the report can be narrowed to one client company. */
  company: boolean;
  /**
   * What the date range is measured against, in words, or null when the report
   * is a position at a moment and a range would mean nothing.
   */
  date: string | null;
}

export const REPORT_FILTER_SPEC: Record<string, ReportFilterSpec> = {};

const NO_FILTERS: ReportFilterSpec = { company: false, date: null };

export function filterSpecFor(key: string): ReportFilterSpec {
  return REPORT_FILTER_SPEC[key] ?? NO_FILTERS;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  // Rejects 2026-02-31, which Date would otherwise roll into March.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string | undefined {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Filters from a query string, keeping only what the report accepts. Anything
 * malformed is dropped rather than refused: a mistyped date in a bookmarked
 * link should show the unfiltered report, not an error page. A range entered
 * backwards is turned round.
 */
export function parseReportFilters(source: ParamSource, spec: ReportFilterSpec): ReportFilters {
  const filters: ReportFilters = {};

  const companyId = read(source, "company");
  if (spec.company && companyId && /^[A-Za-z0-9_-]{1,64}$/.test(companyId)) filters.companyId = companyId;

  if (spec.date) {
    const from = read(source, "from");
    const to = read(source, "to");
    if (from && isDay(from)) filters.from = from;
    if (to && isDay(to)) filters.to = to;
    if (filters.from && filters.to && filters.from > filters.to) {
      [filters.from, filters.to] = [filters.to, filters.from];
    }
  }
  return filters;
}

export function hasFilters(filters: ReportFilters): boolean {
  return Boolean(filters.companyId || filters.from || filters.to);
}

/** The range as a Prisma date condition: from the start of `from` to the end of `to`. */
export function dateCondition(filters: ReportFilters): { gte?: Date; lt?: Date } | undefined {
  if (!filters.from && !filters.to) return undefined;
  const condition: { gte?: Date; lt?: Date } = {};
  if (filters.from) condition.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    condition.lt = end;
  }
  return condition;
}

export function filterQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.companyId) params.set("company", filters.companyId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

function day(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** The filters in words, for the heading of an export. */
export function describeFilters(filters: ReportFilters, companyLabel: string | null): string {
  const parts = [companyLabel ?? "All companies"];
  if (filters.from && filters.to) parts.push(`${day(filters.from)} – ${day(filters.to)}`);
  else if (filters.from) parts.push(`From ${day(filters.from)}`);
  else if (filters.to) parts.push(`Up to ${day(filters.to)}`);
  else parts.push("All dates");
  return parts.join(" · ");
}
