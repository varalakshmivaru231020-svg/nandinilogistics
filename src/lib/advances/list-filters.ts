import type { ViewerScope } from "@/lib/payouts/scope";
import { employeeScopeWhere } from "@/lib/payouts/scope";

/**
 * What narrows the advance and bike rent lists — pure, shared by the page, the
 * export route and the mobile list. The scope (whose riders) is resolved by
 * the caller through `resolveViewerScope`.
 */

export const ADVANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const ADVANCE_PRIORITIES = ["EMERGENCY", "LOW"] as const;

export interface AdvanceListParams {
  status: string;
  priority: string;
  company: string;
  q: string;
}

const one = (v: string | string[] | undefined | null) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const all = (v: string) => (v === "all" ? "" : v);

export function readAdvanceListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): AdvanceListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  return {
    status: all(read("status")),
    priority: all(read("priority")),
    company: all(read("company")),
    q: read("q"),
  };
}

export function advanceListWhere(scope: ViewerScope, params: AdvanceListParams): Record<string, unknown> {
  const { status, priority, company, q } = params;
  const search = q.trim();
  const employee = {
    ...employeeScopeWhere(scope),
    ...(company ? { companies: { some: { companyId: company } } } : {}),
  };
  return {
    employee,
    ...(status && (ADVANCE_STATUSES as readonly string[]).includes(status)
      ? { status: status as "PENDING" | "APPROVED" | "REJECTED" }
      : {}),
    ...(priority && (ADVANCE_PRIORITIES as readonly string[]).includes(priority)
      ? { priority: priority as "EMERGENCY" | "LOW" }
      : {}),
    ...(search
      ? {
          OR: [
            { employee: { name: { contains: search, mode: "insensitive" as const } } },
            { employee: { employeeCode: { contains: search, mode: "insensitive" as const } } },
            { remarks: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export function describeAdvanceFilters(params: AdvanceListParams, companyName: string | null, scopeWords: string | null): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    companyName,
    (ADVANCE_STATUSES as readonly string[]).includes(params.status) ? params.status[0] + params.status.slice(1).toLowerCase() : null,
    params.priority === "EMERGENCY" ? "Emergency" : params.priority === "LOW" ? "Low priority" : null,
    scopeWords,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All advance requests";
}

/* --------------------------------- bike rent -------------------------------- */

export interface BikeRentListParams {
  state: string;
  company: string;
  q: string;
}

export function readBikeRentListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): BikeRentListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  return { state: all(read("state")), company: all(read("company")), q: read("q") };
}

/** `today` is the day the "active" test is made against, as yyyy-mm-dd. */
export function bikeRentListWhere(scope: ViewerScope, params: BikeRentListParams, today: string): Record<string, unknown> {
  const { state, company, q } = params;
  const search = q.trim();
  const day = new Date(`${today}T00:00:00.000Z`);
  return {
    employee: {
      ...employeeScopeWhere(scope),
      ...(company ? { companies: { some: { companyId: company } } } : {}),
    },
    ...(state === "active" ? { OR: [{ endDate: null }, { endDate: { gte: day } }] } : {}),
    ...(state === "ended" ? { endDate: { lt: day } } : {}),
    ...(search
      ? {
          AND: [{
            OR: [
              { bikeNumber: { contains: search, mode: "insensitive" as const } },
              { employee: { name: { contains: search, mode: "insensitive" as const } } },
              { employee: { employeeCode: { contains: search, mode: "insensitive" as const } } },
            ],
          }],
        }
      : {}),
  };
}

export function describeBikeRentFilters(params: BikeRentListParams, companyName: string | null, scopeWords: string | null): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    companyName,
    params.state === "active" ? "Running" : params.state === "ended" ? "Ended" : null,
    scopeWords,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All bike assignments";
}
