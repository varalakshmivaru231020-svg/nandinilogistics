/**
 * One calendar out of eight modules.
 *
 * Nothing in the system was built to be a calendar: a task carries a due date,
 * a lead carries a next action, a site visit carries a slot, an indent carries
 * the day the site needs the material, a schedule activity carries a span. They
 * are read from their own screens and nowhere together, so the question "what
 * is on me this week" had no answer short of opening eight modules.
 *
 * This turns each of those into one shape — an agenda item with a time, a
 * title, a tone and a link back to where it really lives — and puts them on a
 * grid. Pure and Prisma-free, so the date arithmetic that decides what lands on
 * which day can be asserted directly rather than eyeballed in a month view.
 *
 * Every function takes the instant to measure against. Nothing here reads the
 * clock: the server and the browser must agree about what is overdue.
 */

export type AgendaKind =
  | "EVENT"
  | "INVITE"
  | "TASK"
  | "FOLLOW_UP"
  | "SITE_VISIT"
  | "APPROVAL"
  | "ACTIVITY";

export type AgendaTone = "brand" | "good" | "warn" | "bad" | "plum" | "slate";

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  subtitle: string | null;
  /** When it sits on the calendar, as an ISO instant. */
  at: string;
  /** When it ends, for anything with a span. */
  endAt: string | null;
  /** A whole-day item carries no useful time of day. */
  allDay: boolean;
  href: string;
  tone: AgendaTone;
  /** Waiting on this viewer to accept or decline. */
  needsResponse?: boolean;
  /** Finished. It stays on the calendar — it happened — but it is not waiting. */
  done?: boolean;
  /** Where it was going to end before it was pushed out, and how many times. */
  movedFrom?: string | null;
  extendedCount?: number;
}

/*
 * What each kind is called on the calendar. Every one of them names where the
 * item comes from, which is what somebody reading a mixed day needs to know —
 * so the schedule's items are called "Schedule", the word the navigation and
 * the module itself use. They were called "Activity", which reads as a
 * synonym for Task beside the Task items and says nothing about where to go to
 * change one.
 */
export const AGENDA_LABEL: Record<AgendaKind, string> = {
  EVENT: "Calendar",
  INVITE: "Invitation",
  TASK: "Task",
  FOLLOW_UP: "Follow-up",
  SITE_VISIT: "Site visit",
  APPROVAL: "Approval",
  ACTIVITY: "Schedule",
};

/* ------------------------------- day keys -------------------------------- */

/**
 * The day an instant belongs to, as `yyyy-mm-dd`.
 *
 * Computed from the local parts rather than from the ISO string, because
 * `toISOString().slice(0, 10)` is the UTC day — which puts anything after
 * 05:30 IST on the wrong square of the grid.
 */
export function dayKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midnight at the start of the day an instant belongs to. */
export function startOfDay(value: Date | string): Date {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Every day an item touches, so a span shows on each square it crosses. */
export function daysTouched(item: AgendaItem, cap = 60): string[] {
  const from = startOfDay(item.at);
  const to = item.endAt ? startOfDay(item.endAt) : from;
  if (to.getTime() < from.getTime()) return [dayKey(from)];

  const out: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime() && out.length < cap) {
    out.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/* -------------------------------- the grid -------------------------------- */

/**
 * The six-week grid a month view draws, Monday first.
 *
 * Always 42 squares, so the grid does not change height from month to month and
 * the rows below it do not jump.
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-0; the week starts on Monday here.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  const out: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    out.push(dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }
  return out;
}

/** The seven days of the week an instant falls in, Monday first. */
export function weekGrid(value: Date | string): string[] {
  const d = startOfDay(value);
  const lead = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - lead);
  return Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  );
}

/* ------------------------------- arranging -------------------------------- */

/**
 * Items in the order a day reads: whole-day first, then by start time, then by
 * title so the order never wobbles between renders.
 */
export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const at = Date.parse(a.at) - Date.parse(b.at);
    if (at !== 0) return at;
    return a.title.localeCompare(b.title);
  });
}

/** Every item, keyed by each day it touches. */
export function groupByDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const out = new Map<string, AgendaItem[]>();
  for (const item of items) {
    for (const key of daysTouched(item)) {
      const list = out.get(key);
      if (list) list.push(item);
      else out.set(key, [item]);
    }
  }
  for (const [key, list] of out) out.set(key, sortAgenda(list));
  return out;
}

/** How many of each kind are in this set — what the filter chips count. */
export function countsByKind(items: AgendaItem[]): Record<AgendaKind, number> {
  const out: Record<AgendaKind, number> = {
    EVENT: 0, INVITE: 0, TASK: 0, FOLLOW_UP: 0, SITE_VISIT: 0, APPROVAL: 0, ACTIVITY: 0,
  };
  for (const i of items) out[i.kind] += 1;
  return out;
}

/** The kinds the viewer has chosen to see; an empty choice means all of them. */
export function filterKinds(items: AgendaItem[], kinds: AgendaKind[]): AgendaItem[] {
  if (kinds.length === 0) return items;
  const wanted = new Set(kinds);
  return items.filter((i) => wanted.has(i.kind));
}

/**
 * Past its moment and still outstanding.
 *
 * A calendar entry that has simply happened is not overdue — only the things
 * that wait on somebody are: a task, a follow-up, a visit, an approval, an
 * invitation nobody answered.
 */
const WAITS: AgendaKind[] = ["TASK", "FOLLOW_UP", "SITE_VISIT", "APPROVAL", "INVITE"];

export function isOverdue(item: AgendaItem, nowMs: number): boolean {
  // Something finished is never overdue, whatever its date.
  if (item.done) return false;
  if (!WAITS.includes(item.kind)) return false;
  return Date.parse(item.endAt ?? item.at) < nowMs;
}

/** What the day's header counts: everything on it, and what is late. */
export function dayTally(
  items: AgendaItem[],
  nowMs: number,
): { total: number; overdue: number; needsResponse: number } {
  return {
    total: items.length,
    overdue: items.filter((i) => isOverdue(i, nowMs)).length,
    needsResponse: items.filter((i) => i.needsResponse).length,
  };
}

/* -------------------------------- the span -------------------------------- */

/**
 * An event's end, given a start and a length in minutes.
 *
 * The form takes a start and a duration because that is how a meeting is
 * described out loud; the record keeps both ends because that is what a
 * calendar can draw.
 */
export function endFromDuration(startAt: Date | string, minutes: number): Date {
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  return new Date(start.getTime() + Math.max(1, Math.round(minutes)) * 60_000);
}

/** Whether a proposed span is usable. Returns the complaint, or null. */
export function spanProblem(startAt: Date | string, endAt: Date | string): string | null {
  const start = startAt instanceof Date ? startAt.getTime() : Date.parse(startAt);
  const end = endAt instanceof Date ? endAt.getTime() : Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Those dates could not be read.";
  if (end <= start) return "It has to end after it starts.";
  if (end - start > 365 * 86_400_000) return "A calendar task cannot run longer than a year.";
  return null;
}

/**
 * Whether two spans collide, for warning someone they are double-booked.
 *
 * Touching ends do not collide: a meeting ending at 11:00 and one starting at
 * 11:00 are back to back, which is normal and not worth a warning.
 */
export function overlaps(
  a: { at: string; endAt: string | null },
  b: { at: string; endAt: string | null },
): boolean {
  const aStart = Date.parse(a.at);
  const aEnd = Date.parse(a.endAt ?? a.at);
  const bStart = Date.parse(b.at);
  const bEnd = Date.parse(b.endAt ?? b.at);
  return aStart < bEnd && bStart < aEnd;
}

/** Everything already on this person's calendar that the new span runs into. */
export function clashesWith(
  span: { at: string; endAt: string | null },
  items: AgendaItem[],
): AgendaItem[] {
  return items.filter((i) => !i.allDay && overlaps(span, i));
}
