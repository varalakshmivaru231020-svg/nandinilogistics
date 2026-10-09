import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import { loadAgenda } from "@/lib/calendar/service";
import { monthGrid, weekGrid } from "@/lib/calendar/agenda";

import { CalendarScreen } from "./calendar-screen";

export const metadata = { title: "Calendar" };

/**
 * One calendar across the modules that carry a date.
 *
 * The range is worked out here and the agenda is fetched for it, so the client
 * never asks "what month is it" — it is given the grid and the items that fall
 * on it. Nothing below reads the clock: `nowMs` is taken once, here, so the
 * server and the browser agree about what is overdue.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.calendar.agenda.view);
  const raw = await searchParams;
  const read = (k: string) => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };

  const now = new Date();
  const nowMs = now.getTime();

  const view = read("view") === "week" ? "week" : read("view") === "agenda" ? "agenda" : "month";
  // A hand-edited month that is not a month falls back to this one rather than
  // rendering a grid of Invalid Date.
  const anchorRaw = read("on");
  const parsed = anchorRaw ? new Date(`${anchorRaw}T00:00:00`) : null;
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

  // The window the agenda is read for: the whole grid, end exclusive.
  const from = new Date(`${grid[0]}T00:00:00`);
  const last = new Date(`${grid[grid.length - 1]}T00:00:00`);
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);

  const [items, people, projects] = await Promise.all([
    loadAgenda(ctx, { from, to }),
    ctx.has(PERM.calendar.event.assign)
      ? prisma.user.findMany({
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, email: true,
            designation: { select: { name: true } },
          },
        })
      : [],
    prisma.project.findMany({
      where: projectScopeFilter(ctx, "id"),
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  // The task being opened from a notification, if its link carried one.
  const openId = read("event") || null;

  return (
    <CalendarScreen
      view={view}
      anchor={`${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`}
      grid={grid}
      items={items}
      nowMs={nowMs}
      openId={openId}
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        hint: [p.designation?.name, p.email].filter(Boolean).join(" · "),
      }))}
      projects={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
      viewerId={ctx.id}
      can={{
        create: ctx.has(PERM.calendar.event.create),
        assign: ctx.has(PERM.calendar.event.assign),
        respond: ctx.has(PERM.calendar.event.respond),
        cancel: ctx.has(PERM.calendar.event.cancel),
        update: ctx.has(PERM.calendar.event.update),
        complete: ctx.has(PERM.calendar.event.complete),
        extend: ctx.has(PERM.calendar.event.extend),
      }}
    />
  );
}
