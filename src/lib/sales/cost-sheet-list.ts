import type { Prisma } from "@prisma/client";

import {
  joinFilters, pick, projectIdCondition, readParam, searchWords,
  type ParamSource, type ProjectScope,
} from "./list-common";

/**
 * The Cost Sheets list's filters — search, status, project — shared by the
 * screen and its export.
 */

export const COST_SHEET_STATUSES = ["quoted", "booked", "discountPending", "expired"] as const;

export interface CostSheetListParams {
  q: string;
  status: string;
  project: string;
}

export function readCostSheetListParams(source: ParamSource): CostSheetListParams {
  return { q: readParam(source, "q"), status: readParam(source, "status"), project: readParam(source, "project") };
}

/** @param now read once by the caller, so "expired" means the same to screen and export */
export function costSheetListWhere(scope: ProjectScope, p: CostSheetListParams, now: Date): Prisma.CostSheetWhereInput {
  const q = p.q.trim();
  const status = pick(p.status, COST_SHEET_STATUSES);
  const projectId = projectIdCondition(scope, p.project);

  const and: Prisma.CostSheetWhereInput[] = [];
  // Cost sheets are scoped through their unit's project, as on screen.
  if (projectId !== undefined) and.push({ unit: { projectId } });
  if (q) {
    and.push({
      OR: [
        { costSheetNo: { contains: q, mode: "insensitive" } },
        { lead: { name: { contains: q, mode: "insensitive" } } },
        { unit: { unitNumber: { contains: q, mode: "insensitive" } } },
        { unit: { project: { code: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (status === "quoted") and.push({ bookings: { none: {} } });
  if (status === "booked") and.push({ bookings: { some: {} } });
  if (status === "discountPending") and.push({ discountAmount: { gt: 0 }, discountApprovedAt: null });
  if (status === "expired") and.push({ bookings: { none: {} }, validUntil: { lt: now } });

  return and.length ? { AND: and } : {};
}

const STATUS_WORDS: Record<string, string> = {
  quoted: "Quoted", booked: "Booked", discountPending: "Discount pending approval", expired: "Expired, not booked",
};

export function describeCostSheetFilters(p: CostSheetListParams, projectLabel: string | null): string {
  return joinFilters([searchWords(p.q.trim()), STATUS_WORDS[p.status], projectLabel], "All cost sheets in view");
}
