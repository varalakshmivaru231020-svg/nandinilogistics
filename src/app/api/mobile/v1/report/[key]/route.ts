import { REPORTS, runReport } from "@/lib/reports";
import { filterSpecFor, parseReportFilters } from "@/lib/reports/filters";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * One report, run for the caller.
 *
 *   GET /api/mobile/v1/report/indentAgeing?project=<id>&from=2026-04-01
 *
 * Not a list, which is why it is not under `/list`: the key chooses *which*
 * report rather than filtering one, and each has its own filter spec. The
 * permission is `reports.<key>.view`, named per report, so the catalogue below
 * shows a caller only the reports they may run — a phone should not offer
 * sixteen reports and refuse fourteen.
 *
 * `runReport` never widens scope: a project id the caller cannot reach yields
 * an empty report rather than somebody else's numbers.
 */
export const GET = mobileRoute([], async (req, actor) => {
  const key = new URL(req.url).pathname.split("/report/")[1]?.replace(/\/$/, "") ?? "";
  const def = REPORTS.find((r) => r.key === key);
  if (!def) return apiFail(404, `No such report: ${key}`, "unknown-report");

  const code = `reports.${def.key}.view`;
  if (!actor.has(code)) {
    return apiFail(403, `You do not have permission to run that report (${code}).`, code);
  }

  const spec = filterSpecFor(def.key);
  const filters = parseReportFilters(new URL(req.url).searchParams, spec);
  const result = await runReport(def.key, actor, filters);

  return apiOk({
    key: def.key,
    label: def.label,
    description: def.description,
    spec,
    columns: result.columns,
    rows: result.rows,
    summary: result.summary ?? [],
    total: result.rows.length,
    emptyMessage: result.emptyMessage ?? null,
    serverTime: new Date().toISOString(),
  });
});
