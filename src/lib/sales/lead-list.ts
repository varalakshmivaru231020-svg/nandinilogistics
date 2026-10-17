import type { LeadState, Prisma } from "@prisma/client";

import { LEAD_PIPELINE } from "./lead-display";

/**
 * The lead list's filters — search, stage, source, follow-up — as one
 * function, used by the Leads screen and by its export, so a download holds
 * exactly the leads the screen was showing.
 */

export const LEAD_STATES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST",
] as const;

export interface LeadListParams {
  q: string;
  state: string;
  source: string;
  fu: string;
  /**
   * One column of the pipeline — `new`, `visit`, `lost` — which is how the
   * phone shows the board: the six columns as tabs, one at a time. "all" is
   * the web's list view, which shows every stage.
   */
  pipeline: string;
}

export function readLeadListParams(params: URLSearchParams): LeadListParams {
  return {
    q: params.get("q") ?? "",
    state: params.get("state") ?? "all",
    source: params.get("source") ?? "all",
    fu: params.get("fu") ?? "all",
    pipeline: params.get("pipeline") ?? "all",
  };
}

/**
 * @param ownership `{}` for someone who sees every lead, `{ ownerId }` otherwise
 * @param now       read once by the caller, so "overdue" means the same thing
 *                  to the screen and to the export made from it
 */
export function leadListWhere(
  ownership: { ownerId?: string },
  p: LeadListParams,
  now: Date,
): Prisma.LeadWhereInput {
  const q = p.q.trim();
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  // A stage that is not a stage (a hand-edited URL) filters nothing rather than
  // reaching the database as an invalid enum.
  const state = (LEAD_STATES as readonly string[]).includes(p.state) ? (p.state as LeadState) : null;
  const column = LEAD_PIPELINE.find((c) => c.key === p.pipeline) ?? null;

  return {
    ...ownership,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { leadNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(state ? { state } : {}),
    /*
     * A pipeline column is a set of stages — Site Visit holds two — and it
     * narrows on top of the stage filter rather than replacing it, exactly as
     * the web's board is a view of the same filtered leads.
     */
    ...(column ? { state: { in: column.stages as LeadState[] } } : {}),
    ...(p.source !== "all" && p.source ? { sourceId: p.source } : {}),
    // Follow-up filter, as in the design: overdue / today / this week / none set.
    ...(p.fu === "overdue" ? { nextActionAt: { lt: now } } : {}),
    ...(p.fu === "today" ? { nextActionAt: { gte: startOfDay, lt: endOfDay } } : {}),
    ...(p.fu === "week" ? { nextActionAt: { gte: now, lte: soon } } : {}),
    ...(p.fu === "none" ? { nextActionAt: null } : {}),
  };
}

const FOLLOW_UP_WORDS: Record<string, string> = {
  overdue: "Follow-up overdue",
  today: "Follow-up due today",
  week: "Follow-up in the next 7 days",
  none: "No follow-up set",
};

/** The filters in words, for the heading of an export. */
export function describeLeadFilters(p: LeadListParams, sourceName: string | null): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    (LEAD_STATES as readonly string[]).includes(p.state) ? `Stage ${p.state.replace(/_/g, " ").toLowerCase()}` : null,
    sourceName ? `Source ${sourceName}` : null,
    FOLLOW_UP_WORDS[p.fu] ?? null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All leads in view";
}
