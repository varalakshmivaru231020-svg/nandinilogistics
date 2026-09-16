"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { completeActivityAction, createActivityAction, startActivityAction } from "./actions";
import {
  decideExtensionAdminAction, decideExtensionPmAction, requestExtensionAction,
} from "./extension-actions";

interface Activity {
  id: string; code: string; name: string; sequence: number; status: string;
  progressPct: number; isMilestone: boolean; isCriticalPath: boolean;
  baselineStart: string | null; baselineEnd: string | null;
  plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  delayReason: string | null; delayNotes: string | null;
  groupId: string; groupName: string; phaseName: string | null;
  pendingExtension: boolean;
  extensions: Array<{
    id: string; days: number; reason: string; status: string;
    newEnd: string; performance: string | null; decidedBy: string | null;
  }>;
  predecessors: Array<{
    id: string; predecessorId: string; type: string; lagDays: number; code: string; name: string;
  }>;
}

interface Extension {
  id: string; activityCode: string; activityName: string;
  currentDate: string | null; requestedDays: number; requestedDate: string;
  reason: string; status: string; requestedBy: string; requestedAt: string;
  /** Where the activity sits, as the design's sub-line reads it. */
  project: string | null; stage: string | null; projectManager: string | null;
  requestedByRole: string | null;
  pmDecidedBy: string | null; pmDecidedAt: string | null; pmRemark: string | null;
  adminDecidedBy: string | null; adminDecidedAt: string | null; adminRemark: string | null;
  performance: string | null;
}

/** The design's words for where a request has got to. */
const EXT_STAGE: Record<string, { label: string; pill: string }> = {
  AWAITING_PM: { label: "AWAITING PROJECT MANAGER", pill: "bg-[#E8A13A] text-white" },
  AWAITING_ADMIN: { label: "AWAITING ADMIN", pill: "bg-[#6A46C8] text-white" },
};

const DAY = 86_400_000;

/** The design's pill: one shape, coloured by what it says. */
const PILL = "inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold";

/**
 * The design reads an activity's state off the facts — started, finished — and
 * leaves lateness to the flag and the verdicts beside it.
 */
function activityState(a: Activity) {
  if (a.status === "COMPLETED") return "Completed";
  return a.actualStart ? "In progress" : "Not started";
}

const STATE_PILL: Record<string, string> = {
  Completed: "bg-good-050 text-good-700",
  "In progress": "bg-brand-100 text-brand-700",
  "Not started": "bg-surface-field text-navy-500",
};

/** Midnight of the day an instant falls in, so dates compare as dates. */
const dayOf = (v: string | null | undefined) =>
  v ? Math.floor(new Date(v).getTime() / DAY) * DAY : null;

/** Inclusive length of a span, in days — the design counts both ends. */
function spanDays(from: string | null, to: string | null): number {
  const a = dayOf(from), b = dayOf(to);
  return a !== null && b !== null ? Math.round((b - a) / DAY) + 1 : 0;
}

/** The distance between two dates, signed, as the variance columns read it. */
function gapDays(from: string | null, to: string | null): number | null {
  const a = dayOf(from), b = dayOf(to);
  return a !== null && b !== null ? Math.round((b - a) / DAY) : null;
}

const firstDate = (list: Array<string | null>) =>
  list.filter(Boolean).sort()[0] ?? null;
const lastDate = (list: Array<string | null>) =>
  list.filter(Boolean).sort().at(-1) ?? null;

/**
 * What the design measures against: the baseline is the plan, the planned date
 * is where approved extensions have moved the finish to, and the actual dates
 * are what happened.
 */
function metrics(a: Activity, todayMs: number) {
  const ps = a.baselineStart ?? a.plannedStart;
  const pe = a.baselineEnd ?? a.plannedEnd;
  const re = a.plannedEnd ?? pe;
  const finished = a.status === "COMPLETED";
  const reMs = dayOf(re);
  const psMs = dayOf(ps);
  return {
    ps, pe, re,
    ext: Math.max(0, gapDays(pe, re) ?? 0),
    planDays: spanDays(ps, pe),
    startVar: gapDays(ps, a.actualStart),
    revVar: gapDays(re, a.actualEnd),
    onStart: Boolean(a.actualStart) && (gapDays(ps, a.actualStart) ?? 1) <= 0,
    onDone: finished && Boolean(a.actualEnd) && (gapDays(re, a.actualEnd) ?? 1) <= 0,
    overdue: !finished && reMs !== null && reMs < todayMs,
    dueToday: !finished && reMs === todayMs,
    startToday: !a.actualStart && psMs === todayMs,
    startDue: !a.actualStart && psMs !== null && psMs < todayMs,
  };
}

export function ScheduleScreen({
  projects, activeProjectId, projectManager, tab, reportTab, activities, extensions,
  workPackages, can, nowMs,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  projectManager: string | null;
  tab: "plan" | "extensions" | "reports";
  reportTab: "plan" | "performance";
  activities: Activity[];
  extensions: Extension[];
  workPackages: Array<{ id: string; code: string; name: string; phase: string }>;
  can: Record<string, boolean>;
  nowMs: number;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState<string | null>(null);
  const [extending, setExtending] = React.useState<Activity | null>(null);
  const [deciding, setDeciding] = React.useState<Extension | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // "Today" is fixed once, from the clock the page read, so every row agrees.
  const todayMs = Math.floor(nowMs / DAY) * DAY;
  const todayIso = new Date(todayMs).toISOString();

  const done = activities.filter((a) => a.status === "COMPLETED");
  const pendingExt = extensions.filter((e) => e.status === "AWAITING_PM" || e.status === "AWAITING_ADMIN");
  const decidedExt = extensions.filter((e) => e.status === "GRANTED" || e.status === "REFUSED");

  // The design's four tiles: completion, punctuality at each end, and what is
  // running late. Each ratio reads "n of m" so the denominator is visible.
  const started = activities.filter((a) => a.actualStart);
  const startedOnTime = started.filter(
    (a) => a.plannedStart && a.actualStart && new Date(a.actualStart) <= new Date(a.plannedStart),
  );
  const finishedOnTime = done.filter(
    (a) => a.plannedEnd && a.actualEnd && new Date(a.actualEnd) <= new Date(a.plannedEnd),
  );
  const overdue = activities.filter(
    (a) => a.status !== "COMPLETED" && a.plannedEnd && new Date(a.plannedEnd).getTime() < nowMs,
  );

  const stats: Array<{ v: string; l: string }> = [
    { v: `${done.length} of ${activities.length}`, l: "Activities completed" },
    { v: started.length ? `${startedOnTime.length} of ${started.length}` : "—", l: "Started on time" },
    { v: done.length ? `${finishedOnTime.length} of ${done.length}` : "—", l: "Completed on time" },
    { v: String(overdue.length), l: overdue.length === 1 ? "Activity overdue" : "Activities overdue" },
  ];

  // Group into the design's main-category tree.
  const groups = new Map<string, { name: string; phase: string | null; items: Activity[] }>();
  for (const a of activities) {
    const g = groups.get(a.groupId) ?? { name: a.groupName, phase: a.phaseName, items: [] };
    g.items.push(a);
    groups.set(a.groupId, g);
  }

  async function quickStart(a: Activity) {
    setBusy(`start:${a.id}`);
    const res = await startActivityAction(a.id);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    setNotice(`Started ${a.name}.`);
    router.refresh();
  }

  async function quickComplete(a: Activity) {
    setBusy(`done:${a.id}`);
    const res = await completeActivityAction(a.id);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    setNotice(res.data.late ? `Completed ${a.name} — behind plan.` : `Completed ${a.name}.`);
    router.refresh();
  }

  return (
    <div className="animate-fade-up">
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {notice && !error && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

      {/* Project + tabs */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <Select
          value={activeProjectId}
          onChange={(e) => router.push(`/schedule?project=${e.target.value}&tab=${tab}`)}
          className="w-auto min-w-[220px] bg-white font-bold"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        <div className="flex flex-wrap gap-1.5">
          {([["plan", "Schedule"], ["extensions", "Extension requests"], ["reports", "Reports"]] as const)
            .filter(([k]) =>
              (k !== "extensions" || can.viewExtensions) && (k !== "reports" || can.viewReports))
            .map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => router.push(`/schedule?project=${activeProjectId}&tab=${key}`)}
                className={cn(
                  "flex items-center gap-[7px] rounded-full border px-[15px] py-[9px] text-[12px] font-semibold transition-colors",
                  tab === key
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-navy-500 hover:border-brand-300",
                )}
              >
                {label}
                {key === "extensions" && pendingExt.length > 0 && (
                  <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad-600 px-1 text-[10px] font-bold text-white">
                    {pendingExt.length}
                  </span>
                )}
              </button>
            ))}
        </div>

        <div className="flex-1" />
        {tab === "plan" && can.create && (
          <Button size="lg" onClick={() => setAdding("")}>
+ Main category
          </Button>
        )}
      </div>

      {/* --------------------------------- Plan -------------------------------- */}
      {tab === "plan" && (
        <>
          <div className="mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            {stats.map((k) => (
              <div key={k.l} className="rounded-[12px] border border-line-400 bg-white px-4 py-3.5">
                <div className="num font-display text-[19px] font-extrabold text-navy-950">{k.v}</div>
                <div className="mt-[3px] text-[11.5px] font-semibold text-muted-600">{k.l}</div>
              </div>
            ))}
          </div>

          {activities.length === 0 ? (
            <Card>
              <EmptyState
                title="No schedule activities yet"
                description="Add activities to build the plan. The baseline is captured at creation and never edited, so slippage stays measurable."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {[...groups.entries()].map(([id, g]) => {
                const doneN = g.items.filter((a) => a.status === "COMPLETED").length;
                const allDone = g.items.length > 0 && doneN === g.items.length;
                const running = g.items.some((a) => a.actualStart && a.status !== "COMPLETED");
                const state = allDone ? "Completed" : running || doneN ? "In progress" : "Not started";
                const pct = g.items.length ? Math.round((doneN / g.items.length) * 100) : 0;
                const ms = g.items.map((a) => metrics(a, todayMs));
                const ps = firstDate(ms.map((m) => m.ps));
                const pe = lastDate(ms.map((m) => m.re));
                const as = firstDate(g.items.map((a) => a.actualStart));
                const ae = allDone ? lastDate(g.items.map((a) => a.actualEnd)) : null;
                return (
                  <Card key={id} className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3 border-b border-line-300 bg-surface-sunken px-5 py-[15px]">
                      <div className="min-w-0 flex-[1_1_210px]">
                        <div className="flex flex-wrap items-center gap-[9px]">
                          <span className="font-display text-[15px] font-bold text-navy-950">{g.name}</span>
                          <span className={cn(PILL, STATE_PILL[state])}>{state}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                          Main category · PM {projectManager ?? "unassigned"}
                        </div>
                      </div>
                      <div className="min-w-[150px]">
                        <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">PLANNED</div>
                        <div className="mt-[3px] text-[12px] font-semibold text-navy-900">
                          {formatDate(ps)} → {formatDate(pe)}
                        </div>
                        <div className="text-[11px] font-semibold text-muted-600">{spanDays(ps, pe)} days</div>
                      </div>
                      <div className="min-w-[150px]">
                        <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">ACTUAL</div>
                        <div className="mt-[3px] text-[12px] font-semibold text-navy-900">
                          {as ? `${formatDate(as)} → ${ae ? formatDate(ae) : "running"}` : "not started"}
                        </div>
                        <div className="text-[11px] font-semibold text-muted-600">
                          {ae ? `${spanDays(as, ae)} days` : as ? `${spanDays(as, todayIso)} days so far` : "—"}
                        </div>
                      </div>
                      <div className="min-w-0 flex-[1_1_190px]">
                        <div className="text-[12px] font-bold text-brand-700">
                          {pct}% · {doneN} of {g.items.length} sub-activities complete
                        </div>
                        <div className="mt-[7px] h-[7px] max-w-[220px] overflow-hidden rounded-full bg-[#EEF1F8]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: allDone
                                ? "linear-gradient(90deg,#1F9D66,#5BC8A2)"
                                : "linear-gradient(90deg,#0089C9,#5BC8F2)",
                            }}
                          />
                        </div>
                        <div className="mt-[5px] text-[10.5px] font-medium text-[#A8AEC8]">
                          {allDone
                            ? "Auto-completed — every sub-activity is closed"
                            : "Completes automatically when all sub-activities are closed"}
                        </div>
                      </div>
                      {can.create && (
                        <button
                          type="button"
                          onClick={() => setAdding(id)}
                          className="ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] border border-line-400 bg-white px-[13px] py-[9px] text-[11.5px] font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
                        >
                          + Sub-activity
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      {g.items.map((a) => {
                        const m = metrics(a, todayMs);
                        const state = activityState(a);
                        const flag = m.overdue
                          ? { text: "OVERDUE", bg: "bg-bad-600" }
                          : m.dueToday
                            ? { text: "DUE TODAY", bg: "bg-[#E8A13A]" }
                            : m.startToday
                              ? { text: "START TODAY", bg: "bg-brand-500" }
                              : m.startDue && state === "Not started"
                                ? { text: "START OVERDUE", bg: "bg-bad-600" }
                                : null;
                        const pending = a.extensions.find(
                          (e) => e.status === "AWAITING_PM" || e.status === "AWAITING_ADMIN",
                        );
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "grid min-w-[1150px] grid-cols-[minmax(200px,1.5fr)_190px_150px_190px_minmax(180px,1fr)_210px] items-center gap-3 border-b border-[#F2F5FB] py-[13px] pl-11 pr-5 last:border-0",
                              m.overdue && "bg-[#FEF7F7]",
                            )}
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] font-semibold text-navy-900">{a.name}</span>
                                {flag && (
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-[9px] py-1 text-[8.5px] font-extrabold tracking-[.07em] text-white",
                                      flag.bg,
                                    )}
                                  >
                                    {flag.text}
                                  </span>
                                )}
                              </div>
                              <div className="mt-[5px]">
                                <span className={cn(PILL, STATE_PILL[state])}>{state}</span>
                              </div>
                              {a.extensions.map((x) => (
                                <div key={x.id} className="mt-1.5">
                                  <div className="text-[11px] font-medium text-navy-500">
                                    +{x.days} d · {x.reason}
                                  </div>
                                  <span
                                    className={cn(
                                      PILL,
                                      x.status === "GRANTED"
                                        ? x.performance === "Avoidable"
                                          ? "bg-warn-050 text-warn-700"
                                          : "bg-good-050 text-good-700"
                                        : x.status === "REFUSED"
                                          ? "bg-bad-050 text-bad-700"
                                          : "bg-surface-field text-navy-500",
                                    )}
                                  >
                                    {x.status === "GRANTED"
                                      ? `Granted to ${formatDate(x.newEnd)}${x.performance ? ` · ${x.performance}` : ""}${x.decidedBy ? ` · ${x.decidedBy}` : ""}`
                                      : x.status === "REFUSED"
                                        ? `Refused${x.decidedBy ? ` by ${x.decidedBy}` : ""}`
                                        : "Pending approval"}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div>
                              <div className="text-[10px] font-semibold text-muted-400">PLANNED</div>
                              <div className="mt-0.5 text-[12px] font-semibold text-navy-900">
                                {formatDate(m.ps)} → {formatDate(m.pe)}
                              </div>
                              <div className="text-[11px] font-semibold text-muted-600">{m.planDays} days</div>
                            </div>

                            <div>
                              <div className="text-[10px] font-semibold text-warn-700">REVISED</div>
                              <div className="mt-0.5 text-[12px] font-semibold text-warn-800">
                                {m.ext > 0 ? `${formatDate(m.re)}  (+${m.ext} d)` : "—"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] font-semibold text-muted-400">ACTUAL</div>
                              <div className="mt-0.5 text-[12px] font-semibold text-navy-900">
                                {a.actualStart
                                  ? `${formatDate(a.actualStart)} → ${a.actualEnd ? formatDate(a.actualEnd) : "running"}`
                                  : "—"}
                              </div>
                              <div className="text-[11px] font-semibold text-muted-600">
                                {a.actualEnd
                                  ? `${spanDays(a.actualStart, a.actualEnd)} days`
                                  : a.actualStart
                                    ? `${spanDays(a.actualStart, todayIso)} days so far`
                                    : "—"}
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-[5px]">
                              {a.actualStart && (
                                <span
                                  className={cn(PILL, m.onStart ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-700")}
                                >
                                  {m.onStart ? "✓ On-time start" : `▲ Late start ${m.startVar} d`}
                                </span>
                              )}
                              {a.status === "COMPLETED" && (
                                <span
                                  className={cn(PILL, m.onDone ? "bg-good-050 text-good-700" : "bg-bad-050 text-bad-700")}
                                >
                                  {m.onDone ? "✓ On-time completion" : `▲ Late by ${m.revVar} d`}
                                </span>
                              )}
                              {pending && (
                                <span className={cn(PILL, "bg-warn-050 text-warn-700")}>
                                  Extension +{pending.days} d · awaiting{" "}
                                  {pending.status === "AWAITING_PM" ? "PM" : "Admin"}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap justify-end gap-[7px]">
                              {can.startActivity && !a.actualStart && a.status !== "COMPLETED" && (
                                <button
                                  type="button"
                                  disabled={busy === `start:${a.id}`}
                                  onClick={() => quickStart(a)}
                                  className="cursor-pointer whitespace-nowrap rounded-[8px] bg-brand-500 px-3.5 py-[9px] text-[11.5px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                                >
                                  ▶ Start
                                </button>
                              )}
                              {can.completeActivity && a.status !== "COMPLETED" && a.actualStart && (
                                <button
                                  type="button"
                                  disabled={busy === `done:${a.id}`}
                                  onClick={() => quickComplete(a)}
                                  className="cursor-pointer whitespace-nowrap rounded-[8px] bg-good-600 px-3.5 py-[9px] text-[11.5px] font-bold text-white transition-colors hover:bg-good-700 disabled:opacity-60"
                                >
                                  ✓ Completed
                                </button>
                              )}
                              {can.requestExtension && !pending && a.status !== "COMPLETED" && (
                                <button
                                  type="button"
                                  onClick={() => setExtending(a)}
                                  className="cursor-pointer whitespace-nowrap rounded-[8px] border border-[#F3DDBB] bg-warn-050 px-[13px] py-[9px] text-[11.5px] font-bold text-warn-800 transition-colors hover:bg-[#F8E6C8]"
                                >
                                  ⏱ Extension
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ------------------------------ Extensions ----------------------------- */}
      {tab === "extensions" && can.viewExtensions && (
        <>
          <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-200 px-5 py-3.5">
              <span className="font-display text-[13.5px] font-bold text-navy-950">Pending approvals</span>
              <span className="text-[11.5px] font-semibold text-muted-600">
                {pendingExt.length} {pendingExt.length === 1 ? "request" : "requests"} awaiting action
              </span>
            </div>

            {pendingExt.length === 0 && (
              <div className="px-7 py-7 text-center text-[12.5px] font-medium text-muted-400">
                Nothing waiting — requests raised from the plan appear here.
              </div>
            )}

            {pendingExt.map((e) => {
              const stage = EXT_STAGE[e.status];
              const mine = e.status === "AWAITING_PM" ? can.approveExtension : can.approveExtensionAdmin;
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line-100 px-5 py-4 last:border-0">
                  <div className="min-w-[220px] flex-[1_1_240px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-navy-950">{e.activityName}</span>
                      <span className={cn("rounded-full px-[9px] py-[4px] text-[8.5px] font-extrabold uppercase tracking-[.07em]", stage.pill)}>
                        {stage.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                      {[e.stage, e.project, e.projectManager ? `PM ${e.projectManager}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>

                  <div className="min-w-[150px]">
                    <div className="font-display text-[15px] font-extrabold text-warn-700">+{e.requestedDays} days</div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                      {formatDate(e.currentDate)} → {formatDate(e.requestedDate)}
                    </div>
                  </div>

                  <div className="min-w-[220px] flex-[1_1_240px]">
                    <div className="text-[12.5px] font-medium text-navy-900">{e.reason}</div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                      {[e.requestedBy, e.requestedByRole].filter(Boolean).join(" · ")} · {formatDateTime(e.requestedAt)}
                    </div>
                  </div>

                  <div className="ml-auto max-w-[220px] text-right">
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => setDeciding(e)}
                        className="cursor-pointer rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
                      >
                        {e.status === "AWAITING_PM" ? "PM decision" : "Admin decision"}
                      </button>
                    ) : null}
                    <div className="mt-1.5 text-[11px] font-medium text-muted-400">
                      {e.status === "AWAITING_PM"
                        ? "Only the Project Manager can act on this request"
                        : "Only the Admin can grant the revised date"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3.5 overflow-hidden rounded-[13px] border border-line-400 bg-white">
            <div className="border-b border-line-200 px-5 py-3.5 font-display text-[13.5px] font-bold text-navy-950">
              Decision history
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr>
                    {["Activity", "Days", "Reason", "PM remark", "Admin remark", "Result", "Performance"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-line-300 bg-surface-sunken px-3.5 py-[11px] text-left text-[10px] font-bold uppercase tracking-[.08em] text-muted-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decidedExt.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-tint">
                      <td className="border-b border-line-150 px-3.5 py-3">
                        <div className="text-[12.5px] font-semibold text-navy-900">{e.activityName}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                          {[e.stage, e.projectManager ? `PM ${e.projectManager}` : null].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3 text-[12.5px] font-bold text-warn-700">
                        +{e.requestedDays} d
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3">
                        <div className="text-[12.5px] font-medium text-navy-900">{e.reason}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                          {[e.requestedBy, e.requestedByRole].filter(Boolean).join(" · ")} · {formatDateTime(e.requestedAt)}
                        </div>
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3 text-[12px] font-medium text-navy-600">
                        {e.pmRemark || "—"}
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3 text-[12px] font-medium text-navy-600">
                        {e.adminRemark || "—"}
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3">
                        <span
                          className={cn(
                            "whitespace-nowrap rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
                            e.status === "GRANTED" ? "bg-good-050 text-good-700" : "bg-bad-050 text-bad-700",
                          )}
                        >
                          {e.status === "GRANTED" ? `Granted to ${formatDate(e.requestedDate)}` : "Refused"}
                        </span>
                      </td>
                      <td className="border-b border-line-150 px-3.5 py-3">
                        {e.performance ? (
                          <span
                            className={cn(
                              "rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
                              e.performance === "Genuine" ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-700",
                            )}
                          >
                            {e.performance}
                          </span>
                        ) : (
                          <span className="text-[12px] font-medium text-muted-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {decidedExt.length === 0 && (
              <div className="px-7 py-7 text-center text-[12.5px] font-medium text-muted-400">
                No decisions recorded yet.
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------- Reports ------------------------------- */}
      {tab === "reports" && can.viewReports && (
        <ScheduleReports
          activities={activities}
          reportTab={reportTab}
          projectId={activeProjectId}
          projectManager={projectManager}
          nowMs={nowMs}
        />
      )}

      {adding !== null && (
        <ActivityModal
          projectId={activeProjectId}
          workPackages={workPackages}
          defaultWorkPackageId={adding}
          onClose={() => setAdding(null)}
          onDone={(m) => { setAdding(null); setNotice(m); router.refresh(); }}
        />
      )}
      {extending && (
        <ExtensionModal
          activity={extending}
          onClose={() => setExtending(null)}
          onDone={(m) => { setExtending(null); setNotice(m); router.refresh(); }}
        />
      )}
      {deciding && (
        <DecideModal
          request={deciding}
          onClose={() => setDeciding(null)}
          onDone={(m) => { setDeciding(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------- Modals ---------------------------------- */

function ActivityModal({
  projectId, workPackages, defaultWorkPackageId, onClose, onDone,
}: {
  projectId: string;
  workPackages: Array<{ id: string; code: string; name: string; phase: string }>;
  /** The category the design opened this from, already chosen. */
  defaultWorkPackageId: string;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectId", projectId);
    const res = await createActivityAction(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Activity added — its baseline is now locked.");
  }

  return (
    <Modal
      open onClose={onClose} title="Add schedule activity"
      description="The dates you enter become the baseline. It is never edited afterwards — only the planned date can move, and only through an approved extension."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="activity-form" loading={busy}>Add activity</Button>
        </>
      }
    >
      <form id="activity-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required><Input name="code" required className="uppercase" placeholder="SLB-07" /></Field>
          <Field label="Sequence"><Input name="sequence" type="number" min={0} defaultValue={0} /></Field>
          <Field label="Activity name" required className="sm:col-span-2">
            <Input name="name" required placeholder="Slab casting — 7th floor" />
          </Field>
          <Field label="Main category" className="sm:col-span-2" hint="Groups the activity in the plan.">
            <Select name="workPackageId" defaultValue={defaultWorkPackageId}>
              <option value="">— Unassigned —</option>
              {workPackages.map((w) => (
                <option key={w.id} value={w.id}>{w.phase} · {w.code} — {w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Planned start" required><Input name="plannedStart" type="date" required /></Field>
          <Field label="Planned finish" required><Input name="plannedEnd" type="date" required /></Field>
          <Field label="" className="sm:col-span-2">
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-navy-600">
              <input type="checkbox" name="isMilestone" className="h-4 w-4 rounded border-line-400 text-brand-500" />
              This is a milestone
            </label>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function ExtensionModal({
  activity, onClose, onDone,
}: { activity: Activity; onClose: () => void; onDone: (m: string) => void }) {
  const [days, setDays] = React.useState("7");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const base = activity.plannedEnd ?? activity.baselineEnd;
  const projected = base
    ? new Date(new Date(base).getTime() + (Number(days) || 0) * DAY).toISOString()
    : null;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await requestExtensionAction(activity.id, Number(days), reason);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Extension requested — it now sits with the Project Manager.");
  }

  return (
    <Modal
      open onClose={onClose}
      title={`Request extension · ${activity.name}`}
      description={`Current target ${formatDate(base)} — the request goes to the Project Manager first, then to Admin for the revised date. The baseline does not move.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="warning" onClick={submit} loading={busy} disabled={!reason.trim() || !(Number(days) > 0)}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Extension days" required>
            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className="num text-right" />
          </Field>
          <Field label="Requested new date">
            <div className="num flex h-[38px] items-center rounded-[9px] bg-warn-050 px-3 font-display text-[14px] font-extrabold text-warn-800">
              {formatDate(projected)}
            </div>
          </Field>
        </div>
        <Field label="Reason" required hint="This is what the variance report shows against the slip.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder="Three weeks lost to unseasonal rain in the casting window" />
        </Field>
      </div>
    </Modal>
  );
}

function DecideModal({
  request, onClose, onDone,
}: { request: Extension; onClose: () => void; onDone: (m: string) => void }) {
  const isAdmin = request.status === "AWAITING_ADMIN";
  const [note, setNote] = React.useState("");
  const [performance, setPerformance] = React.useState<"Genuine" | "Avoidable">("Genuine");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "reject");
    setError(null);
    const res = isAdmin
      ? await decideExtensionAdminAction(request.id, approve, note, performance)
      : await decideExtensionPmAction(request.id, approve, note);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    onDone(
      approve
        ? isAdmin
          ? "Extension granted — planned finish moved."
          : "Passed to the Admin for the revised date."
        : "Extension refused.",
    );
  }

  return (
    <Modal
      open onClose={onClose}
      title={`${isAdmin ? "Admin decision" : "PM decision"} · ${request.activityName}`}
      description={`${request.requestedBy} asked for ${request.requestedDays} more day(s), moving ${formatDate(request.currentDate)} to ${formatDate(request.requestedDate)}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={() => decide(false)} loading={busy === "reject"} disabled={!note.trim()}>
            <X className="h-3.5 w-3.5" />
            Refuse
          </Button>
          <Button variant="success" onClick={() => decide(true)} loading={busy === "approve"}>
            <Check className="h-3.5 w-3.5" />
            {isAdmin ? "Grant" : "Pass to Admin"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="rounded-[10px] bg-surface-sunken px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-muted-500">
            <AlertTriangle className="h-3 w-3" /> Reason given
          </p>
          <p className="mt-1 text-[12.5px] font-medium text-navy-600">{request.reason}</p>
          {isAdmin && request.pmRemark && (
            <p className="mt-2 text-[11.5px] font-medium text-muted-500">
              PM · {request.pmDecidedBy}: {request.pmRemark}
            </p>
          )}
        </div>
        {isAdmin && (
          <Field label="Was the delay genuine?" hint="It is what the performance column reads.">
            <div className="flex gap-1.5">
              {(["Genuine", "Avoidable"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPerformance(p)}
                  className={cn(
                    "cursor-pointer rounded-[8px] border px-3.5 py-2 text-[12px] font-bold transition-colors",
                    performance === p
                      ? "border-brand-500 bg-brand-100 text-brand-700"
                      : "border-line-400 bg-white text-navy-500 hover:border-brand-300",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Remark" hint="Required when refusing.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Schedule reports --------------------------- */

/**
 * The design's Reports tab: schedule against actual, activity by activity, and
 * how the Project Manager fared. Both read the activities already on screen, so
 * what the report says and what the plan shows can never disagree.
 */
function ScheduleReports({
  activities, reportTab, projectId, projectManager, nowMs,
}: {
  activities: Activity[];
  reportTab: "plan" | "performance";
  projectId: string;
  projectManager: string | null;
  nowMs: number;
}) {
  const router = useRouter();
  const todayMs = Math.floor(nowMs / DAY) * DAY;
  const todayIso = new Date(todayMs).toISOString();

  const rows = activities.map((a) => ({ a, m: metrics(a, todayMs) }));

  const plannedDays = rows.reduce((n, r) => n + r.m.planDays, 0);
  const actualDays = rows
    .filter((r) => r.a.actualEnd)
    .reduce((n, r) => n + spanDays(r.a.actualStart, r.a.actualEnd), 0);
  const grantedDays = rows.reduce((n, r) => n + r.m.ext, 0);
  const slipDays = rows
    .filter((r) => r.a.actualEnd)
    .reduce((n, r) => n + Math.max(0, r.m.revVar ?? 0), 0);

  // One project, one Project Manager — the design scores them on how the plan
  // was kept, with genuine extensions excused and avoidable ones charged for.
  const started = rows.filter((r) => r.a.actualStart);
  const finished = rows.filter((r) => r.a.status === "COMPLETED");
  const onStart = started.filter((r) => r.m.onStart).length;
  const onDone = finished.filter((r) => r.m.onDone).length;
  const granted = activities.flatMap((a) => a.extensions.filter((e) => e.status === "GRANTED"));
  const genuine = granted.filter((e) => e.performance !== "Avoidable").length;
  const avoidable = granted.filter((e) => e.performance === "Avoidable").length;
  const base = started.length + finished.length
    ? Math.round(((onStart + onDone) / (started.length + finished.length)) * 100)
    : 0;
  const score = Math.max(0, base - avoidable * 10);

  const TH_R = "border-b border-line-300 bg-surface-sunken px-[13px] py-[11px] text-[10px] font-bold uppercase tracking-[.08em] text-muted-500 whitespace-nowrap";
  const TD_R = "border-b border-[#F0F3FA] px-[13px] py-3 text-[12px] font-semibold text-navy-600";

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {([["plan", "Schedule vs actual"], ["performance", "Project Manager performance"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(`/schedule?project=${projectId}&tab=reports&report=${key}`)}
            className={cn(
              "cursor-pointer rounded-full border px-[15px] py-[9px] text-[12px] font-semibold transition-colors",
              reportTab === key
                ? "border-brand-500 bg-brand-100 text-brand-700"
                : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {reportTab === "plan" ? (
        <div>
          <div className="mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <div className="rounded-[12px] border border-line-400 bg-white px-4 py-3.5">
              <div className="font-display text-[18px] font-extrabold text-navy-950">{plannedDays} d</div>
              <div className="mt-[3px] text-[11.5px] font-semibold text-muted-600">Planned duration · all activities</div>
            </div>
            <div className="rounded-[12px] border border-line-400 bg-white px-4 py-3.5">
              <div className="font-display text-[18px] font-extrabold text-navy-950">{actualDays} d</div>
              <div className="mt-[3px] text-[11.5px] font-semibold text-muted-600">Actual duration · completed only</div>
            </div>
            <div className="rounded-[12px] border border-[#F3DDBB] bg-warn-050 px-4 py-3.5">
              <div className="font-display text-[18px] font-extrabold text-warn-800">+{grantedDays} d</div>
              <div className="mt-[3px] text-[11.5px] font-semibold text-warn-800 opacity-85">Extensions granted by Admin</div>
            </div>
            <div className="rounded-[12px] border border-line-400 bg-white px-4 py-3.5">
              <div className={cn("font-display text-[18px] font-extrabold", slipDays ? "text-bad-700" : "text-good-700")}>
                {slipDays ? `+${slipDays} d` : "nil"}
              </div>
              <div className="mt-[3px] text-[11.5px] font-semibold text-muted-600">Slippage against revised dates</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
            <div className="border-b border-line-200 px-5 py-3.5 font-display text-[13.5px] font-bold text-navy-950">
              Schedule vs actual completion
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse">
                <thead>
                  <tr>
                    {[
                      ["Activity", "left"], ["Plan start", "left"], ["Plan end", "left"], ["Days", "right"],
                      ["Revised end", "left"], ["Ext", "right"], ["Actual start", "left"], ["Actual end", "left"],
                      ["Actual days", "right"], ["Difference", "right"], ["On time start", "center"],
                      ["On time done", "center"], ["Remarks", "left"],
                    ].map(([h, align]) => (
                      <th key={h} className={cn(TH_R, `text-${align}`)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-12 text-center text-[12px] font-medium text-muted-500">
                        No activities on this schedule yet.
                      </td>
                    </tr>
                  ) : rows.map(({ a, m }) => {
                    const diff = a.actualEnd ? m.revVar : null;
                    const state = activityState(a);
                    return (
                      <tr key={a.id} className="hover:bg-surface-tint">
                        <td className={cn(TD_R, "whitespace-normal")}>
                          <div className="text-[12.5px] font-bold text-navy-950">{a.name}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-muted-400">{a.groupName}</div>
                          <div className="mt-1"><span className={cn(PILL, STATE_PILL[state])}>{state}</span></div>
                        </td>
                        <td className={TD_R}>{formatDate(m.ps)}</td>
                        <td className={TD_R}>{formatDate(m.pe)}</td>
                        <td className={cn(TD_R, "num text-right font-bold")}>{m.planDays}</td>
                        <td className={cn(TD_R, "text-warn-800")}>{m.ext ? formatDate(m.re) : "—"}</td>
                        <td className={cn(TD_R, "num text-right font-bold text-warn-800")}>{m.ext ? `+${m.ext}` : "—"}</td>
                        <td className={TD_R}>{a.actualStart ? formatDate(a.actualStart) : "—"}</td>
                        <td className={TD_R}>{a.actualEnd ? formatDate(a.actualEnd) : "—"}</td>
                        <td className={cn(TD_R, "num text-right font-bold")}>
                          {a.actualEnd
                            ? spanDays(a.actualStart, a.actualEnd)
                            : a.actualStart
                              ? `${spanDays(a.actualStart, todayIso)}*`
                              : "—"}
                        </td>
                        <td
                          className={cn(
                            TD_R, "num text-right font-bold",
                            diff === null ? "text-muted-400" : diff > 0 ? "text-bad-700" : "text-good-700",
                          )}
                        >
                          {diff === null ? "—" : diff > 0 ? `+${diff} d` : diff === 0 ? "on time" : `${diff} d`}
                        </td>
                        <td
                          className={cn(
                            TD_R, "text-center text-[13px] font-extrabold",
                            !a.actualStart ? "text-[#C6CFE8]" : m.onStart ? "text-good-700" : "text-bad-700",
                          )}
                        >
                          {!a.actualStart ? "—" : m.onStart ? "✓" : "✗"}
                        </td>
                        <td
                          className={cn(
                            TD_R, "text-center text-[13px] font-extrabold",
                            a.status !== "COMPLETED" ? "text-[#C6CFE8]" : m.onDone ? "text-good-700" : "text-bad-700",
                          )}
                        >
                          {a.status !== "COMPLETED" ? "—" : m.onDone ? "✓" : "✗"}
                        </td>
                        <td className={cn(TD_R, "max-w-[230px] whitespace-normal text-[11.5px] font-medium text-muted-400")}>
                          {a.extensions.length ? a.extensions.map((e) => e.reason).join(" · ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line-200 bg-surface-sunken px-5 py-3 text-[11.5px] font-medium text-muted-400">
              Difference is measured against the revised (Admin-approved) target date. An asterisk marks
              activities still running.
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            <div className="rounded-[13px] border border-line-400 bg-white px-[19px] py-[17px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-[14.5px] font-bold text-navy-950">
                    {projectManager ?? "Unassigned"}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                    {activities.length} activities scheduled
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={cn(
                      "font-display text-[19px] font-extrabold",
                      score >= 85 ? "text-good-700" : score >= 70 ? "text-warn-700" : "text-bad-700",
                    )}
                  >
                    {score}
                  </div>
                  <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">SCORE</div>
                </div>
              </div>
              <div className="mt-[7px] h-2 overflow-hidden rounded-full bg-[#EEF1F8]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${score}%`,
                    background: score >= 85
                      ? "linear-gradient(90deg,#1F9D66,#5BC8A2)"
                      : score >= 70
                        ? "linear-gradient(90deg,#E8A13A,#F2C063)"
                        : "linear-gradient(90deg,#D8494A,#E8827F)",
                  }}
                />
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
                <div className="rounded-[9px] border border-line-200 bg-surface-tint px-3 py-2.5">
                  <div className="font-display text-[14px] font-bold text-good-700">
                    {started.length ? Math.round((onStart / started.length) * 100) : 0}%
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-muted-600">
                    On-time start · {onStart} of {started.length}
                  </div>
                </div>
                <div className="rounded-[9px] border border-line-200 bg-surface-tint px-3 py-2.5">
                  <div className="font-display text-[14px] font-bold text-brand-700">
                    {finished.length ? Math.round((onDone / finished.length) * 100) : 0}%
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-muted-600">
                    On-time completion · {onDone} of {finished.length}
                  </div>
                </div>
                <div className="rounded-[9px] border border-[#C4E8D4] bg-good-050 px-3 py-2.5">
                  <div className="font-display text-[14px] font-bold text-good-700">{genuine}</div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-good-700 opacity-85">
                    Genuine extensions · excluded
                  </div>
                </div>
                <div className="rounded-[9px] border border-[#F3DDBB] bg-warn-050 px-3 py-2.5">
                  <div className="font-display text-[14px] font-bold text-warn-800">
                    {avoidable} ({avoidable ? `−${avoidable * 10}` : "—"})
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-warn-800 opacity-85">
                    Avoidable extensions
                  </div>
                </div>
              </div>
              <div className="mt-[11px] text-[11px] font-medium text-[#A8AEC8]">
                {avoidable
                  ? `${avoidable} avoidable extension${avoidable === 1 ? "" : "s"} counted against the score`
                  : "No avoidable extensions — genuine delays excluded"}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-[12px] border border-[#DDE4F3] bg-[#EFF3FB] px-[17px] py-3.5 text-[12px] font-medium text-[#2F308C]">
            On-time start and on-time completion are scored equally. Extensions the Admin marked
            “Genuine” are excluded; each “Avoidable” extension costs 10 points.
          </div>
        </div>
      )}
    </div>
  );
}
