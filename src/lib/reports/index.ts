import "server-only";

import type { AuthContext } from "@/lib/rbac/context";

import type { ReportFilters } from "./filters";
import type { ReportDef, ReportResult } from "./types";

/**
 * The report catalogue. Each entry's permission is `reports.<key>.view`, which
 * already exists in the permission registry — this file supplies the query.
 *
 * The SOW's reports (TL report, rider report by company, lead conversion,
 * payout summary, advance outstanding) are added here as their modules land.
 */
export const REPORTS: ReportDef[] = [];

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

export async function runReport(
  key: string,
  _ctx: AuthContext,
  _filters: ReportFilters = {},
): Promise<ReportResult> {
  switch (key) {
    default:
      throw new Error(`Unknown report: ${key}`);
  }
}
