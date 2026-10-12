import { REPORTS } from "@/lib/reports";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * The reports this caller may run — not the whole catalogue.
 *
 * Filtered by permission here rather than on the phone, so the app's reports
 * screen is a list of things that will work. The alternative is sixteen rows,
 * fourteen of which answer 403 when tapped.
 */
export const GET = mobileRoute([], async (_req, actor) =>
  apiOk({
    reports: REPORTS.filter((r) => actor.has(`reports.${r.key}.view`)).map((r) => ({
      key: r.key,
      label: r.label,
      audience: r.audience,
      description: r.description,
    })),
  }),
);
