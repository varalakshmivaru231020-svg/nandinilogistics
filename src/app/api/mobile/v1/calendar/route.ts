import { z } from "zod";

import { loadAgenda } from "@/lib/calendar/service";
import { AGENDA_LABEL, countsByKind, dayTally, monthGrid, weekGrid } from "@/lib/calendar/agenda";
import { PERM } from "@/lib/permissions/codes";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * The agenda for a window, aggregated across every module the caller may see.
 *
 * The app does not assemble this from seven list endpoints — `loadAgenda`
 * already queries each source only when the viewer holds its permission, so a
 * salesperson's calendar comes back with follow-ups and visits and no indents,
 * without the app having to know that rule.
 *
 * `serverTime` is sent because the phone's clock is not evidence. Overdue is
 * decided against this instant, the same way the web page passes `nowMs` down
 * instead of reading the clock during render, so the two never disagree about
 * what is late.
 */
const Query = z.object({
  view: z.enum(["month", "week", "agenda"]).default("month"),
  /** The day the window is anchored on, as yyyy-mm-dd. */
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GET = mobileRoute([PERM.calendar.agenda.view], async (req, actor) => {
  const url = new URL(req.url);
  const { view, on } = Query.parse({
    view: url.searchParams.get("view") ?? undefined,
    on: url.searchParams.get("on") ?? undefined,
  });

  const now = new Date();
  const parsed = on ? new Date(`${on}T00:00:00`) : null;
  const anchor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;

  const grid =
    view === "week"
      ? weekGrid(anchor)
      : view === "agenda"
        ? Array.from({ length: 30 }, (_, i) => {
            const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })
        : monthGrid(anchor.getFullYear(), anchor.getMonth());

  const from = new Date(`${grid[0]}T00:00:00`);
  const last = new Date(`${grid[grid.length - 1]}T00:00:00`);
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);

  const items = await loadAgenda(actor, { from, to });
  const nowMs = now.getTime();

  return apiOk({
    view,
    grid,
    items,
    counts: countsByKind(items),
    /*
     * What each kind is called, sent rather than held by the app.
     *
     * The app kept its own copy of these seven words, which is how a calendar
     * can read "Activity" on a phone and "Schedule" on the web for the same
     * item. One definition, `AGENDA_LABEL`, drawn by both.
     */
    kindLabels: AGENDA_LABEL,
    tally: dayTally(items, nowMs),
    serverTime: now.toISOString(),
  });
});
