import type { Prisma } from "@prisma/client";

import {
  describeRange, joinFilters, pick, rangeCondition, readDateRange, readParam, searchWords,
  type DateRange, type ParamSource,
} from "./list-common";

/**
 * The Site Visits list's filters — search, status, visit date — shared by the
 * screen and its export.
 */

export const SITE_VISIT_STATUSES = ["scheduled", "overdue", "completed"] as const;

export interface SiteVisitListParams extends DateRange {
  q: string;
  status: string;
}

export function readSiteVisitListParams(source: ParamSource): SiteVisitListParams {
  return { q: readParam(source, "q"), status: readParam(source, "status"), ...readDateRange(source) };
}

/**
 * @param ownership   `{}` for someone who sees every lead, `{ conductedById }` otherwise
 * @param canSeeContact whether lead phone numbers are shown; if not, they are not searchable
 * @param now         read once by the caller, so "overdue" means the same to screen and export
 */
export function siteVisitListWhere(
  ownership: { conductedById?: string },
  p: SiteVisitListParams,
  canSeeContact: boolean,
  now: Date,
): Prisma.SiteVisitWhereInput {
  const q = p.q.trim();
  const status = pick(p.status, SITE_VISIT_STATUSES);
  const range = rangeCondition(p);

  const or: Prisma.SiteVisitWhereInput[] = [
    { lead: { name: { contains: q, mode: "insensitive" } } },
    { lead: { leadNo: { contains: q, mode: "insensitive" } } },
    { conductedBy: { name: { contains: q, mode: "insensitive" } } },
  ];
  if (canSeeContact) or.push({ lead: { phone: { contains: q } } });

  const and: Prisma.SiteVisitWhereInput[] = [];
  if (q) and.push({ OR: or });
  if (status === "scheduled") and.push({ visitedAt: null });
  if (status === "overdue") and.push({ visitedAt: null, scheduledAt: { lt: now } });
  if (status === "completed") and.push({ visitedAt: { not: null } });
  // The visit date is when it happened, or when it is planned for if it has not.
  if (range) and.push({ OR: [{ visitedAt: range }, { visitedAt: null, scheduledAt: range }] });

  return { ...ownership, ...(and.length ? { AND: and } : {}) };
}

const STATUS_WORDS: Record<string, string> = {
  scheduled: "Scheduled", overdue: "Scheduled and past due", completed: "Completed",
};

export function describeSiteVisitFilters(p: SiteVisitListParams): string {
  return joinFilters(
    [searchWords(p.q.trim()), STATUS_WORDS[p.status], describeRange("Visit date", p)],
    "All site visits in view",
  );
}
