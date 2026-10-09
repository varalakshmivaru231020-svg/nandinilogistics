"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/primitives";
import { SearchSelect } from "@/components/ui/search-select";
import { ModuleStats } from "@/components/list/module-stats";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import {
  AGENDA_LABEL, countsByKind, dayTally, filterKinds, groupByDay, isOverdue,
  type AgendaItem, type AgendaKind,
} from "@/lib/calendar/agenda";
import {
  cancelCalendarTaskAction, completeCalendarTaskAction, createCalendarTaskAction,
  extendCalendarTaskAction, respondToCalendarTaskAction,
} from "./actions";

/**
 * The calendar screen.
 *
 * Three views over the same agenda — a month grid, a week, and a rolling list —
 * because the three questions people ask of a calendar are different: how is
 * the month shaped, what is this week, and what is next.
 */

const TONE: Record<AgendaItem["tone"], { dot: string; chip: string }> = {
  brand: { dot: "bg-brand-500", chip: "bg-brand-100 text-brand-700" },
  good: { dot: "bg-good-600", chip: "bg-good-050 text-good-700" },
  warn: { dot: "bg-amber-500", chip: "bg-warn-050 text-warn-800" },
  bad: { dot: "bg-bad-600", chip: "bg-bad-050 text-bad-700" },
  plum: { dot: "bg-plum-600", chip: "bg-plum-050 text-plum-700" },
  slate: { dot: "bg-slate-600", chip: "bg-slate-050 text-slate-600" },
};

const KINDS: AgendaKind[] = ["EVENT", "INVITE", "TASK", "FOLLOW_UP", "SITE_VISIT", "APPROVAL", "ACTIVITY"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayOf(key: string) {
  return Number(key.slice(8, 10));
}
function monthOf(key: string) {
  return Number(key.slice(5, 7));
}
function longDay(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
  });
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarScreen({
  view, anchor, grid, items, nowMs, openId, people, projects, viewerId, can,
}: {
  view: "month" | "week" | "agenda";
  anchor: string;
  grid: string[];
  items: AgendaItem[];
  nowMs: number;
  openId: string | null;
  people: Array<{ id: string; name: string; hint: string }>;
  projects: Array<{ id: string; label: string }>;
  viewerId: string;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kinds, setKinds] = React.useState<AgendaKind[]>([]);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [declining, setDeclining] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const todayKey = React.useMemo(() => {
    const d = new Date(nowMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [nowMs]);

  const shown = filterKinds(items, kinds);
  const byDay = React.useMemo(() => groupByDay(shown), [shown]);
  const counts = countsByKind(items);

  const invites = items.filter((i) => i.needsResponse);
  const overdue = items.filter((i) => isOverdue(i, nowMs));

  // The day whose detail is open: whatever was tapped, else today when today
  // is on this grid, else the first day of it.
  const focusKey = picked ?? (grid.includes(todayKey) ? todayKey : grid[0]);
  const focusItems = byDay.get(focusKey) ?? [];

  const openEvent = openId ? items.find((i) => i.id === `event:${openId}`) ?? null : null;

  function go(next: Record<string, string>) {
    const sp = new URLSearchParams();
    sp.set("view", next.view ?? view);
    sp.set("on", next.on ?? anchor);
    router.push(`/calendar?${sp.toString()}`);
  }

  function step(by: number) {
    const d = new Date(`${anchor}T00:00:00`);
    if (view === "month") d.setMonth(d.getMonth() + by);
    else if (view === "week") d.setDate(d.getDate() + by * 7);
    else d.setDate(d.getDate() + by * 30);
    go({ on: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` });
  }

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); return; }
    toast(done);
    router.refresh();
  }

  const title = new Date(`${anchor}T00:00:00`).toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Calendar"
        description="Everything with a date on it — your calendar tasks, tasks due, follow-ups, site visits, deliveries and the schedule — on one grid."
        actions={can.create ? <Button onClick={() => setCreating(true)}>+ New calendar task</Button> : undefined}
      />

      <ModuleStats
        figures={[
          { value: String(items.length), label: "On this view" },
          {
            value: String(invites.length),
            label: "Waiting on your answer",
            tone: invites.length ? "brand" : undefined,
          },
          { value: String(overdue.length), label: "Overdue", tone: overdue.length ? "bad" : undefined },
          { value: String(counts.TASK), label: "Tasks due" },
          { value: String(counts.FOLLOW_UP + counts.SITE_VISIT), label: "Follow-ups & visits" },
          { value: String(counts.APPROVAL), label: "Approvals dated" },
        ]}
      />

      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      {/* period and view */}
      <div className="mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous period"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-[9px] border border-line-400 bg-white text-navy-500 transition-colors hover:border-brand-500"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next period"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-[9px] border border-line-400 bg-white text-navy-500 transition-colors hover:border-brand-500"
        >
          ›
        </button>
        <span className="font-display text-[15px] font-bold text-navy-950">{title}</span>
        <button
          type="button"
          onClick={() => go({ on: todayKey })}
          className="cursor-pointer rounded-[9px] border border-line-400 bg-white px-3 py-[7px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500"
        >
          Today
        </button>

        <div className="flex-1" />

        {(["month", "week", "agenda"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => go({ view: v })}
            className={cn(
              "cursor-pointer rounded-[9px] px-3.5 py-[7px] text-[12px] font-semibold capitalize transition-colors",
              v === view
                ? "bg-brand-500 text-white"
                : "border border-line-400 bg-white text-navy-500 hover:border-brand-500",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {/* what to show */}
      <div className="mb-3.5 flex flex-wrap items-center gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <button
          type="button"
          onClick={() => setKinds([])}
          className={cn(
            "cursor-pointer rounded-full px-3 py-[7px] text-[12px] font-semibold transition-colors",
            kinds.length === 0 ? "bg-navy-950 text-white" : "border border-line-400 bg-white text-navy-500",
          )}
        >
          Everything <span className="num opacity-70">{items.length}</span>
        </button>
        {KINDS.filter((k) => counts[k] > 0).map((k) => {
          const on = kinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKinds((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
              className={cn(
                "cursor-pointer rounded-full px-3 py-[7px] text-[12px] font-semibold transition-colors",
                on ? "bg-brand-500 text-white" : "border border-line-400 bg-white text-navy-500 hover:border-brand-500",
              )}
            >
              {AGENDA_LABEL[k]} <span className="num opacity-70">{counts[k]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-3.5 [grid-template-columns:1fr_330px] max-lg:[grid-template-columns:1fr]">

        {/* ----------------------------- the grid ----------------------------- */}
        <div className="min-w-0 overflow-hidden rounded-[13px] border border-line-400 bg-white">
          {view !== "agenda" && (
            <div className="grid grid-cols-7 border-b border-line-300 bg-surface-sunken">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2.5 text-center text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                  {d}
                </div>
              ))}
            </div>
          )}

          {view === "agenda" ? (
            <div className="divide-y divide-line-150">
              {grid.filter((k) => (byDay.get(k) ?? []).length > 0).map((key) => (
                <div key={key} className="px-[18px] py-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn(
                      "text-[12.5px] font-bold",
                      key === todayKey ? "text-brand-700" : "text-navy-950",
                    )}>
                      {longDay(key)}
                    </span>
                    {key === todayKey && (
                      <span className="rounded-full bg-brand-100 px-2 py-[3px] text-[10px] font-bold text-brand-700">Today</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {(byDay.get(key) ?? []).map((i) => (
                      <AgendaRow key={`${key}:${i.id}`} item={i} nowMs={nowMs} onPick={() => setPicked(key)} />
                    ))}
                  </div>
                </div>
              ))}
              {grid.every((k) => (byDay.get(k) ?? []).length === 0) && (
                <p className="px-[18px] py-14 text-center text-[12.5px] font-medium text-muted-400">
                  Nothing on the next 30 days.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {grid.map((key) => {
                const list = byDay.get(key) ?? [];
                const tally = dayTally(list, nowMs);
                const thisMonth = monthOf(key) === Number(anchor.slice(5, 7));
                const isToday = key === todayKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPicked(key)}
                    className={cn(
                      "min-h-[104px] cursor-pointer border-b border-r border-line-150 p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-surface-hover",
                      !thisMonth && view === "month" && "bg-surface-sunken",
                      key === focusKey && "bg-brand-100/50",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className={cn(
                        "num grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[11.5px] font-bold",
                        isToday ? "bg-brand-500 text-white" : thisMonth ? "text-navy-900" : "text-muted-300",
                      )}>
                        {dayOf(key)}
                      </span>
                      {tally.overdue > 0 && (
                        <span className="num rounded-full bg-bad-050 px-1.5 text-[10px] font-bold text-bad-700">
                          {tally.overdue}
                        </span>
                      )}
                    </div>
                    <div className="space-y-[3px]">
                      {list.slice(0, 3).map((i) => (
                        <span
                          key={`${key}:${i.id}`}
                          className={cn(
                            "flex items-center gap-1 truncate rounded-[5px] px-1.5 py-[2px] text-[10.5px] font-semibold",
                            TONE[i.tone].chip,
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE[i.tone].dot)} />
                          <span className="truncate">{i.allDay ? i.title : `${timeOf(i.at)} ${i.title}`}</span>
                        </span>
                      ))}
                      {list.length > 3 && (
                        <span className="block px-1.5 text-[10.5px] font-semibold text-muted-500">
                          +{list.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------------------------- the day panel -------------------------- */}
        <div className="space-y-3.5">
          {invites.length > 0 && (
            <div className="overflow-hidden rounded-[13px] border border-plum-200 bg-white">
              <div className="border-b border-line-200 bg-plum-050 px-[18px] py-3">
                <span className="font-display text-[13.5px] font-bold text-plum-700">
                  Waiting on your answer · {invites.length}
                </span>
              </div>
              <div className="divide-y divide-line-150">
                {invites.map((i) => (
                  <div key={i.id} className="px-[18px] py-3">
                    <div className="text-[13.5px] font-bold text-navy-950">{i.title}</div>
                    <div className="num mt-0.5 text-[11.5px] font-medium text-muted-500">
                      {formatDateTime(i.at)}
                    </div>
                    {i.subtitle && (
                      <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">{i.subtitle}</div>
                    )}
                    {can.respond && (
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          loading={busy}
                          onClick={() => run(
                            () => respondToCalendarTaskAction(i.id.replace("event:", ""), true, ""),
                            "Accepted — it is on your calendar.",
                          )}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeclining(i.id.replace("event:", ""))}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line-200 px-[18px] py-3">
              <span className="font-display text-[13.5px] font-bold text-navy-950">{longDay(focusKey)}</span>
              <span className="num text-[11.5px] font-semibold text-muted-500">
                {focusItems.length} {focusItems.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="divide-y divide-line-150">
              {focusItems.map((i) => (
                <div key={i.id} className="px-[18px] py-3">
                  <AgendaRow item={i} nowMs={nowMs} />
                </div>
              ))}
              {focusItems.length === 0 && (
                <p className="px-[18px] py-10 text-center text-[12.5px] font-medium text-muted-400">
                  Nothing on this day.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {creating && (
        <NewCalendarTask
          people={people}
          projects={projects}
          viewerId={viewerId}
          canAssign={can.assign}
          onClose={() => setCreating(false)}
          onDone={(m) => { setCreating(false); toast(m); router.refresh(); }}
        />
      )}

      {declining && (
        <DeclinePrompt
          id={declining}
          onClose={() => setDeclining(null)}
          onDone={() => { setDeclining(null); toast("Declined — whoever raised it has been told."); router.refresh(); }}
        />
      )}

      {openEvent && (
        <CalendarTaskSheet
          item={openEvent}
          can={can}
          onClose={() => router.push("/calendar")}
          onDone={(m) => { toast(m); router.push("/calendar"); router.refresh(); }}
        />
      )}

    </div>
  );
}

/**
 * What you can do to a calendar task: finish it, push it out, or call it off.
 *
 * Each is offered only when it is possible — a finished task cannot be extended,
 * a cancelled one cannot be finished — and only when the viewer holds the
 * permission. The server checks both again.
 */
function CalendarTaskSheet({
  item, can, onClose, onDone,
}: {
  item: AgendaItem;
  can: Record<string, boolean>;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const id = item.id.replace("event:", "");
  const [mode, setMode] = React.useState<null | "complete" | "extend" | "cancel">(null);
  const [remark, setRemark] = React.useState("");
  const [newEnd, setNewEnd] = React.useState(item.endAt ? item.endAt.slice(0, 16) : "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const res =
      mode === "complete" ? await completeCalendarTaskAction(id, remark)
        : mode === "extend" ? await extendCalendarTaskAction(id, newEnd, remark)
          : await cancelCalendarTaskAction(id, remark);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); return; }
    onDone(
      mode === "complete" ? "Marked done."
        : mode === "extend" ? "Finish moved — everyone on it has been told."
          : "Calendar task cancelled.",
    );
  }

  const confirmLabel = mode === "complete" ? "Mark done" : mode === "extend" ? "Move the finish" : "Cancel it";
  const needsReason = mode === "extend" || mode === "cancel";

  return (
    <Modal
      open
      onClose={onClose}
      title={item.title}
      description={item.subtitle ?? undefined}
      size="sm"
      footer={
        mode === null ? (
          <Button variant="outline" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => { setMode(null); setError(null); }}>Back</Button>
            <Button
              variant={mode === "cancel" ? "danger" : "success"}
              loading={busy}
              onClick={send}
              disabled={
                (needsReason && remark.trim().length < 3) || (mode === "extend" && !newEnd)
              }
            >
              {confirmLabel}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="rounded-[10px] bg-surface-sunken px-3.5 py-3">
          <p className="num text-[12.5px] font-semibold text-navy-900">
            {formatDateTime(item.at)}
            {item.endAt ? ` → ${formatDateTime(item.endAt)}` : ""}
          </p>
          {item.movedFrom && (
            <p className="num mt-1 text-[11.5px] font-medium text-warn-800">
              Was due to end {formatDateTime(item.movedFrom)}
              {item.extendedCount ? ` · moved ${item.extendedCount} time${item.extendedCount === 1 ? "" : "s"}` : ""}
            </p>
          )}
          {item.done && (
            <p className="mt-1 text-[11.5px] font-bold text-good-700">This task is done.</p>
          )}
        </div>

        {mode === null && (
          <div className="flex flex-wrap gap-2">
            {can.complete && !item.done && (
              <Button variant="success" onClick={() => { setMode("complete"); setRemark(""); }}>
                Mark as completed
              </Button>
            )}
            {can.extend && !item.done && (
              <Button variant="outline" onClick={() => { setMode("extend"); setRemark(""); }}>
                Extend
              </Button>
            )}
            {can.cancel && (
              <Button variant="danger" onClick={() => { setMode("cancel"); setRemark(""); }}>
                Cancel
              </Button>
            )}
            {item.done && !can.cancel && (
              <p className="text-[12.5px] font-medium text-muted-500">Nothing left to do on this one.</p>
            )}
          </div>
        )}

        {mode === "extend" && (
          <Field label="New finish" required hint="It has to be later than it ends now.">
            <Input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </Field>
        )}

        {mode !== null && (
          <Field
            label={mode === "complete" ? "Remark" : "Why"}
            required={needsReason}
            hint={
              mode === "complete"
                ? "Optional — everyone on it is told either way."
                : "Everyone on it sees this."
            }
          >
            <Textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** One line of the agenda, wherever it is drawn. */
function AgendaRow({
  item, nowMs, onPick,
}: { item: AgendaItem; nowMs: number; onPick?: () => void }) {
  const late = isOverdue(item, nowMs);
  return (
    <Link
      href={item.href}
      onClick={onPick}
      className="flex items-start gap-2.5 rounded-[9px] px-1 py-1 transition-colors hover:bg-surface-hover"
    >
      <span className={cn("mt-[6px] h-2 w-2 shrink-0 rounded-full", TONE[item.tone].dot)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-navy-900">{item.title}</span>
        <span className="num mt-0.5 block text-[11.5px] font-medium text-muted-500">
          {item.allDay ? "All day" : timeOf(item.at)} · {AGENDA_LABEL[item.kind]}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </span>
      </span>
      {late && (
        <span className="shrink-0 rounded-full bg-bad-050 px-2 py-[3px] text-[10px] font-bold text-bad-700">
          Overdue
        </span>
      )}
      {item.needsResponse && (
        <span className="shrink-0 rounded-full bg-plum-050 px-2 py-[3px] text-[10px] font-bold text-plum-700">
          Accept?
        </span>
      )}
    </Link>
  );
}

/**
 * Declining needs a reason, so it asks for one.
 *
 * Its own dialog rather than a control inside the row's button: a button inside
 * a button is not a thing the browser can dispatch sensibly, and the keyboard
 * cannot reach the inner one at all.
 */
function DeclinePrompt({
  id, onClose, onDone,
}: { id: string; onClose: () => void; onDone: () => void }) {
  const [remark, setRemark] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    const res = await respondToCalendarTaskAction(id, false, remark);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); return; }
    onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Decline this calendar task"
      description="Whoever raised it sees your reason, so they can put it on somebody else."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={send} disabled={remark.trim().length < 3}>
            Decline
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Why" required>
          <Textarea
            rows={3}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="On another site that morning."
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Raising one, and putting it on people. */
function NewCalendarTask({
  people, projects, viewerId, canAssign, onClose, onDone,
}: {
  people: Array<{ id: string; name: string; hint: string }>;
  projects: Array<{ id: string; label: string }>;
  viewerId: string;
  canAssign: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [allDay, setAllDay] = React.useState(false);
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [adding, setAdding] = React.useState("");

  // Derived, never synced: whoever is picked plus the next empty slot.
  const free = people.filter((p) => !assignees.includes(p.id));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    for (const id of assignees) fd.append("attendeeIds", id);
    const res = await createCalendarTaskAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(assignees.length ? "Calendar task sent for acceptance." : "Calendar task added.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New calendar task"
      description="A title, a timeline, and whoever it is on. They accept it before it lands on their calendar."
      size="md"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="calendar-form" loading={busy}>
            {assignees.length ? "Send for acceptance" : "Add to my calendar"}
          </Button>
        </>
      }
    >
      <form id="calendar-form" onSubmit={submit} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Title" required>
          <Input name="title" required autoFocus placeholder="Site walk with the structural consultant" />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="allDay"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[#0089C9]"
          />
          <span className="text-[12.5px] font-semibold text-navy-900">Runs all day</span>
        </label>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label={allDay ? "First day" : "Starts"} required>
            <Input name="startAt" type={allDay ? "date" : "datetime-local"} required />
          </Field>
          <Field label={allDay ? "Last day" : "Ends"} required>
            <Input name="endAt" type={allDay ? "date" : "datetime-local"} required />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Where">
            <Input name="location" placeholder="Tower B · 6th floor" />
          </Field>
        </div>

        <Field label="Details">
          <Textarea name="description" rows={2} placeholder="What it is for, and anything to bring." />
        </Field>

        {canAssign && (
          <div>
            <p className="mb-[5px] text-[12px] font-semibold text-muted-600">
              On whom <span className="font-medium text-muted-400">· they accept before it is theirs</span>
            </p>
            {assignees.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {assignees.map((id) => {
                  const p = people.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-[11.5px] font-bold text-brand-700"
                    >
                      {p?.name ?? id}
                      {id === viewerId && <span className="font-medium text-brand-600">(you)</span>}
                      <button
                        type="button"
                        aria-label={`Remove ${p?.name ?? "person"}`}
                        onClick={() => setAssignees((cur) => cur.filter((x) => x !== id))}
                        className="cursor-pointer text-brand-700"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <SearchSelect
              options={free.map((p) => ({ id: p.id, label: p.name, hint: p.hint, keywords: p.hint }))}
              value={adding}
              onChange={(id) => {
                if (id) setAssignees((cur) => [...cur, id]);
                setAdding("");
              }}
              placeholder="Search people…"
              emptyLabel="Nobody left to add"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
