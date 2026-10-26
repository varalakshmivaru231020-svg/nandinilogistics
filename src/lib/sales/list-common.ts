import { dateCondition, parseReportFilters } from "@/lib/reports/filters";

/**
 * Pieces shared by the CRM list filters. Pure and Prisma-free: each list's
 * where-builder is used by its page and by its export route, so a download
 * holds exactly the rows the screen was showing.
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

export interface DateRange {
  from?: string;
  to?: string;
}

/** A from/to pair from the URL, malformed dates dropped and a backwards range turned round. */
export function readDateRange(source: ParamSource): DateRange {
  const f = parseReportFilters(source, { company: false, date: "range" });
  return { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) };
}

/** The range as a Prisma condition on a date column, or undefined for none. */
export function rangeCondition(range: DateRange): { gte?: Date; lt?: Date } | undefined {
  return dateCondition(range);
}

function day(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** The range in words, e.g. "Captured 01 Apr 2026 – 30 Jun 2026", or null. */
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
