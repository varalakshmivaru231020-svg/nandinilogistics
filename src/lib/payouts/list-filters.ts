import type { ViewerScope } from "./scope";
import { employeeScopeWhere } from "./scope";

/**
 * What narrows the payout lists, as a `where` nothing has to restate.
 *
 * Pure, and apart from the page, the export route and the mobile list, so the
 * three cannot disagree. The scope — whose riders — is resolved by the caller
 * and passed in; only POSTED imports are in view unless the caller says the
 * viewer may see drafts.
 */

export interface PayoutListParams {
  company: string;
  status: string;
  from: string;
  to: string;
  q: string;
}

const one = (v: string | string[] | undefined | null) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string) => {
  if (!ISO_DAY.test(v)) return "";
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
};

export const PAYOUT_LINE_STATUSES = ["PAID", "HOLD"] as const;

export function readPayoutListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): PayoutListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  const all = (v: string) => (v === "all" ? "" : v);
  return {
    company: all(read("company")),
    status: all(read("status")),
    from: day(read("from")),
    to: day(read("to")),
    q: read("q"),
  };
}

export function payoutLineWhere(
  scope: ViewerScope,
  params: PayoutListParams,
  opts: { seesDrafts: boolean },
): Record<string, unknown> {
  const { company, status, from, to, q } = params;
  const search = q.trim();
  const period =
    from || to
      ? {
          ...(from ? { periodFrom: { gte: new Date(`${from}T00:00:00.000Z`) } } : {}),
          ...(to ? { periodTo: { lte: new Date(`${to}T00:00:00.000Z`) } } : {}),
        }
      : {};

  return {
    employee: employeeScopeWhere(scope),
    import: {
      ...(opts.seesDrafts ? {} : { status: "POSTED" as const }),
      ...(company ? { companyId: company } : {}),
      ...period,
    },
    ...(status && (PAYOUT_LINE_STATUSES as readonly string[]).includes(status)
      ? { status: status as "PAID" | "HOLD" }
      : {}),
    ...(search
      ? {
          OR: [
            { riderCode: { contains: search, mode: "insensitive" as const } },
            { employee: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export function describePayoutFilters(
  params: PayoutListParams,
  companyName: string | null,
  scopeWords: string | null,
): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    companyName,
    params.status === "HOLD" ? "On hold" : params.status === "PAID" ? "Paid" : null,
    params.from || params.to ? `Period ${params.from || "any"} to ${params.to || "any"}` : null,
    scopeWords,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All posted payouts";
}

/* ---------------------------------- imports --------------------------------- */

export interface ImportListParams {
  company: string;
  status: string;
  q: string;
}

export const IMPORT_STATUSES = ["DRAFT", "POSTED"] as const;

export function readImportListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ImportListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  const all = (v: string) => (v === "all" ? "" : v);
  return { company: all(read("company")), status: all(read("status")), q: read("q") };
}

export function importListWhere(params: ImportListParams): Record<string, unknown> {
  const search = params.q.trim();
  return {
    ...(params.company ? { companyId: params.company } : {}),
    ...(params.status && (IMPORT_STATUSES as readonly string[]).includes(params.status)
      ? { status: params.status as "DRAFT" | "POSTED" }
      : {}),
    ...(search
      ? {
          OR: [
            { fileName: { contains: search, mode: "insensitive" as const } },
            { company: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export function describeImportFilters(params: ImportListParams, companyName: string | null): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    companyName,
    params.status === "DRAFT" ? "Drafts" : params.status === "POSTED" ? "Posted" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All payout imports";
}
