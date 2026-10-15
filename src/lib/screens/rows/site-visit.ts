import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { formatDateTime } from "@/lib/utils";

export { siteVisitEmpty } from "@/lib/sales/site-visit-display";

/**
 * The site-visit row, as `site-visits-screen.tsx` draws one.
 *
 * The screen splits the list in two — Scheduled, then Completed — so the row
 * says which it is: a scheduled visit carries when it is due, and "due" beside
 * it once that moment has passed; a completed one carries its rating out of
 * five and the feedback under it.
 */

export interface SiteVisitRowInput {
  id: string;
  leadName: string;
  leadNo: string;
  leadPhone: string;
  conductedByName: string;
  scheduledAt: Date | string;
  visitedAt: Date | string | null;
  rating: number | null;
  feedback: string | null;
}

export function siteVisitScreenRow(
  v: SiteVisitRowInput,
  nowMs: number,
  canViewContact: boolean,
  /** The visit's own decisions — the web row says "Record outcome". */
  actions: RecordAction[] = [],
): ScreenRow {
  const done = Boolean(v.visitedAt);
  const overdue = !done && new Date(v.scheduledAt).getTime() < nowMs;

  return {
    id: v.id,
    title: v.leadName,
    meta:
      v.leadNo +
      (canViewContact ? ` · ${v.leadPhone}` : "") +
      ` · with ${v.conductedByName}`,
    lines: [
      done
        ? { label: "Visited", value: formatDateTime(v.visitedAt) }
        : { label: "Scheduled", value: formatDateTime(v.scheduledAt) + (overdue ? " · due" : "") },
      ...(done && v.feedback ? [{ value: v.feedback }] : []),
    ],
    ...(done && v.rating
      ? {
          status: {
            label: `${v.rating}/5`,
            tone: v.rating >= 4 ? ("good" as const) : v.rating >= 3 ? ("warn" as const) : ("bad" as const),
          },
        }
      : overdue
        ? { status: { label: "Due", tone: "warn" as const } }
        : { status: { label: done ? "Completed" : "Scheduled", tone: done ? ("good" as const) : ("info" as const) } }),
    actions: asRowActions(actions, {
      complete: "Record outcome",
      cancel: "Cancel visit",
    }),
  };
}
