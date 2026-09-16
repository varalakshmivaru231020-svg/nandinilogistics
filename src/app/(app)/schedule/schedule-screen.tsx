"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, Diamond, Link2, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  addDependencyAction, completeActivityAction, createActivityAction,
  removeDependencyAction, startActivityAction, updateActivityProgressAction,
} from "./actions";
import { LINK_LABEL, LINK_TYPES, type LinkType } from "@/lib/schedule/engine";
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

const STATUS_TONE: Record<string, "muted" | "brand" | "good" | "bad"> = {
  NOT_STARTED: "muted", IN_PROGRESS: "brand", COMPLETED: "good", DELAYED: "bad",
};

const DAY = 86_400_000;

export function ScheduleScreen({
  projects, activeProjectId, projectManager, tab, reportTab, activities, extensions,
  workPackages, delayReasons, can, nowMs,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  projectManager: string | null;
  tab: "plan" | "extensions" | "reports";
  reportTab: "plan" | "performance";
  activities: Activity[];
  extensions: Extension[];
  workPackages: Array<{ id: string; code: string; name: string; phase: string }>;
  delayReasons: Array<{ id: string; name: string }>;
  can: Record<string, boolean>;
  nowMs: number;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [updating, setUpdating] = React.useState<Activity | null>(null);
  const [extending, setExtending] = React.useState<Activity | null>(null);
  const [deciding, setDeciding] = React.useState<Extension | null>(null);
  const [linking, setLinking] = React.useState<Activity | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

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



  function slipDays(a: Activity): number {
    if (!a.baselineEnd) return 0;
    const compare = a.actualEnd ?? a.plannedEnd;
    if (!compare) return 0;
    return Math.round((new Date(compare).getTime() - new Date(a.baselineEnd).getTime()) / DAY);
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
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
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
          <Button size="lg" onClick={() => setAdding(true)}>
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
              {[...groups.entries()].map(([id, g]) => (
                <Card key={id} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3 border-b border-line-300 bg-surface-sunken px-5 py-3.5">
                    <div className="min-w-0 flex-[1_1_210px]">
                      <div className="font-display text-[15px] font-bold text-navy-950">{g.name}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                        {g.phase ? `${g.phase} · ` : ""}PM {projectManager ?? "unassigned"}
                      </div>
                    </div>
                    {(() => {
                      const closed = g.items.filter((a) => a.status === "COMPLETED").length;
                      const pct = Math.round(
                        g.items.reduce((sum, a) => sum + a.progressPct, 0) / g.items.length,
                      );
                      const starts = g.items.map((a) => a.plannedStart).filter(Boolean) as string[];
                      const ends = g.items.map((a) => a.plannedEnd).filter(Boolean) as string[];
                      const from = starts.sort()[0];
                      const to = ends.sort().at(-1);
                      return (
                        <>
                          <div className="min-w-[150px]">
                            <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">PLANNED</div>
                            <div className="text-[12.5px] font-semibold text-navy-900">
                              {from ? formatDate(from) : "—"} → {to ? formatDate(to) : "—"}
                            </div>
                          </div>
                          <div className="min-w-[200px] flex-1">
                            <div className="text-[12.5px] font-bold text-brand-700">
                              {pct}% · {closed} of {g.items.length} sub-activities complete
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EDF0F8]">
                              <div
                                className="h-full rounded-full bg-brand-500"
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-muted-400">
                              Completes automatically when all sub-activities are closed
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <ul className="divide-y divide-line-100">
                    {g.items.map((a) => {
                      const slip = slipDays(a);
                      return (
                        <li key={a.id} className={cn("px-5 py-3", a.status === "DELAYED" && "bg-bad-050/40")}>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="min-w-0 flex-[1_1_240px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {a.isMilestone && <Diamond className="h-3 w-3 fill-warn-700 text-warn-700" />}
                                <span className="text-[13px] font-semibold text-navy-900">{a.name}</span>
                                {a.isCriticalPath && can.viewCriticalPath && (
                                  <Zap className="h-3 w-3 fill-warn-700 text-warn-700" />
                                )}
                                {a.pendingExtension && <Badge tone="warn">extension pending</Badge>}
                              </div>
                              <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                                {a.code}
                                {a.delayReason && ` · delay: ${a.delayReason}`}
                              </div>
                            </div>

                            {can.viewBaseline && (
                              <div className="min-w-[132px]">
                                <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">BASELINE</div>
                                <div className="text-[11.5px] font-medium text-navy-500">
                                  {formatDate(a.baselineStart)} – {formatDate(a.baselineEnd)}
                                </div>
                              </div>
                            )}
                            <div className="min-w-[132px]">
                              <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">PLANNED</div>
                              <div className={cn("text-[11.5px] font-medium", slip > 0 ? "text-warn-700" : "text-navy-500")}>
                                {formatDate(a.plannedStart)} – {formatDate(a.plannedEnd)}
                                {slip > 0 && <span className="ml-1 font-bold">+{slip}d</span>}
                              </div>
                            </div>
                            <div className="min-w-[132px]">
                              <div className="text-[10px] font-semibold tracking-[.06em] text-muted-400">ACTUAL</div>
                              <div className="text-[11.5px] font-medium text-navy-500">
                                {a.actualStart ? `${formatDate(a.actualStart)} – ${formatDate(a.actualEnd)}` : "not started"}
                              </div>
                            </div>

                            <div className="w-[132px]">
                              <div className="mb-1 flex justify-between">
                                <span className="num text-[11.5px] font-bold text-navy-600">{a.progressPct}%</span>
                                <Badge tone={STATUS_TONE[a.status] ?? "muted"}>{a.status.replace(/_/g, " ")}</Badge>
                              </div>
                              <div className="h-[6px] overflow-hidden rounded-full bg-[#EDF0F8]">
                                <div
                                  className={cn("h-full rounded-full", a.status === "DELAYED" ? "bg-bad-600" : "bg-brand-500")}
                                  style={{ width: `${Math.max(2, a.progressPct)}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex shrink-0 gap-1">
                              {/* The design's one-click row actions, before the fuller dialog. */}
                              {can.startActivity && !a.actualStart && a.status !== "COMPLETED" && (
                                <Button size="xs" variant="secondary" loading={busy === `start:${a.id}`} onClick={() => quickStart(a)}>
                                  ▶ Start
                                </Button>
                              )}
                              {can.completeActivity && a.status !== "COMPLETED" && (
                                <Button size="xs" variant="success" loading={busy === `done:${a.id}`} onClick={() => quickComplete(a)}>
                                  ✓ Completed
                                </Button>
                              )}
                              {can.updateProgress && (
                                <Button size="xs" variant="secondary" onClick={() => setUpdating(a)}>Progress</Button>
                              )}
                              {can.requestExtension && !a.pendingExtension && a.status !== "COMPLETED" && (
                                <Button size="xs" variant="ghost" onClick={() => setExtending(a)}>
                                  <CalendarClock className="h-3 w-3" />
                                </Button>
                              )}
                              {can.manageDependencies && (
                                <Button size="xs" variant="plain" title="Dependencies" onClick={() => setLinking(a)}>
                                  <Link2 className="h-3 w-3" />
                                  {a.predecessors.length > 0 && (
                                    <span className="num text-[10px] font-bold">{a.predecessors.length}</span>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
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
          extensions={extensions}
          reportTab={reportTab}
          projectId={activeProjectId}
          nowMs={nowMs}
        />
      )}

      {adding && (
        <ActivityModal
          projectId={activeProjectId}
          workPackages={workPackages}
          onClose={() => setAdding(false)}
          onDone={(m) => { setAdding(false); setNotice(m); router.refresh(); }}
        />
      )}
      {updating && (
        <ProgressModal
          activity={updating}
          delayReasons={delayReasons}
          nowMs={nowMs}
          onClose={() => setUpdating(null)}
          onDone={(m) => { setUpdating(null); setNotice(m); router.refresh(); }}
        />
      )}
      {extending && (
        <ExtensionModal
          activity={extending}
          onClose={() => setExtending(null)}
          onDone={(m) => { setExtending(null); setNotice(m); router.refresh(); }}
        />
      )}
      {linking && (
        <DependencyModal
          activity={linking}
          candidates={activities.filter((x) => x.id !== linking.id)}
          onClose={() => setLinking(null)}
          onDone={(m) => { setLinking(null); setNotice(m); router.refresh(); }}
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
  projectId, workPackages, onClose, onDone,
}: {
  projectId: string;
  workPackages: Array<{ id: string; code: string; name: string; phase: string }>;
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
            <Select name="workPackageId" defaultValue="">
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

function ProgressModal({
  activity, delayReasons, nowMs, onClose, onDone,
}: {
  activity: Activity;
  delayReasons: Array<{ id: string; name: string }>;
  nowMs: number;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [progress, setProgress] = React.useState(String(activity.progressPct));
  const [actualStart, setActualStart] = React.useState(activity.actualStart?.slice(0, 10) ?? "");
  const [actualEnd, setActualEnd] = React.useState(activity.actualEnd?.slice(0, 10) ?? "");
  const [delayReasonId, setDelayReasonId] = React.useState("");
  const [delayNotes, setDelayNotes] = React.useState(activity.delayNotes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const plannedEnd = activity.plannedEnd ? new Date(activity.plannedEnd).getTime() : null;
  const pct = Number(progress) || 0;
  const finishing = actualEnd ? new Date(actualEnd).getTime() : pct >= 100 ? nowMs : null;
  const late =
    plannedEnd !== null &&
    ((finishing !== null && finishing > plannedEnd) || (finishing === null && pct < 100 && nowMs > plannedEnd));
  const needsReason = late && !activity.delayReason && !delayReasonId;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await updateActivityProgressAction(
      activity.id, pct, actualStart || null, actualEnd || null, delayReasonId || null, delayNotes,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(`${activity.code} updated to ${pct}%.`);
  }

  return (
    <Modal
      open onClose={onClose} title={`Progress — ${activity.name}`}
      description={`Planned ${formatDate(activity.plannedStart)} – ${formatDate(activity.plannedEnd)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={needsReason}>Save progress</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {late && (
          <Alert tone="warn" title="This activity has slipped">
            A delay reason is required before the update can be saved — that is what makes the
            variance report meaningful.
          </Alert>
        )}
        <Field label="Progress (%)" required>
          <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} className="num text-right" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Actual start"><Input type="date" value={actualStart} onChange={(e) => setActualStart(e.target.value)} /></Field>
          <Field label="Actual finish"><Input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} /></Field>
        </div>
        {(late || activity.delayReason) && (
          <>
            <Field label="Delay reason" required={needsReason}>
              <Select value={delayReasonId} onChange={(e) => setDelayReasonId(e.target.value)}>
                <option value="">{activity.delayReason ? `Keep: ${activity.delayReason}` : "Select a reason…"}</option>
                {delayReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Delay notes">
              <Textarea value={delayNotes} onChange={(e) => setDelayNotes(e.target.value)} rows={2} />
            </Field>
          </>
        )}
      </div>
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
 * The design's Reports tab: a plan report (baseline against actual, activity by
 * activity) and a performance report (how the slip is distributed). Both read
 * the activities already on screen, so what the report says and what the plan
 * shows can never disagree.
 */
function ScheduleReports({
  activities, extensions, reportTab, projectId, nowMs,
}: {
  activities: Activity[];
  extensions: Extension[];
  reportTab: "plan" | "performance";
  projectId: string;
  nowMs: number;
}) {
  const router = useRouter();

  const rows = activities.map((a) => {
    const baseline = a.baselineEnd ? new Date(a.baselineEnd).getTime() : null;
    const finish = a.actualEnd
      ? new Date(a.actualEnd).getTime()
      : a.plannedEnd
        ? new Date(a.plannedEnd).getTime()
        : null;
    const slipDays = baseline !== null && finish !== null ? Math.round((finish - baseline) / DAY) : null;
    const overdue = !a.actualEnd && a.plannedEnd !== null && new Date(a.plannedEnd).getTime() < nowMs;
    return { ...a, slipDays, overdue };
  });

  const slipped = rows.filter((r) => (r.slipDays ?? 0) > 0);
  const onTime = rows.filter((r) => r.actualEnd && (r.slipDays ?? 0) <= 0);
  const worst = [...slipped].sort((a, b) => (b.slipDays ?? 0) - (a.slipDays ?? 0)).slice(0, 8);
  const totalSlip = slipped.reduce((s, r) => s + (r.slipDays ?? 0), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([["plan", "Plan vs actual"], ["performance", "Performance"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(`/schedule?project=${projectId}&tab=reports&report=${key}`)}
            className={cn(
              "rounded-[9px] border px-3.5 py-2 text-[12px] font-bold transition-colors",
              reportTab === key
                ? "border-brand-500 bg-brand-100 text-brand-700"
                : "border-line-400 bg-white text-muted-600 hover:bg-surface-hover",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {reportTab === "plan" ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Activity", "Baseline finish", "Planned finish", "Actual finish", "Progress", "Slip", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                      i >= 4 ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[12px] font-medium text-muted-500">
                  No activities on this schedule yet.
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-line-200 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-[12.5px] font-bold text-navy-950">{r.name}</p>
                    <p className="num text-[11px] font-medium text-muted-400">{r.code}</p>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-medium text-muted-600">{formatDate(r.baselineEnd)}</td>
                  <td className="px-4 py-3 text-[12px] font-medium text-muted-600">{formatDate(r.plannedEnd)}</td>
                  <td className="px-4 py-3 text-[12px] font-medium text-muted-600">
                    {r.actualEnd ? formatDate(r.actualEnd) : "—"}
                  </td>
                  <td className="num px-4 py-3 text-right text-[12px] font-bold text-navy-900">{r.progressPct}%</td>
                  <td className={cn(
                    "num px-4 py-3 text-right text-[12px] font-bold",
                    (r.slipDays ?? 0) > 0 ? "text-bad-600" : (r.slipDays ?? 0) < 0 ? "text-good-700" : "text-muted-500",
                  )}>
                    {r.slipDays === null ? "—" : r.slipDays > 0 ? `+${r.slipDays}d` : `${r.slipDays}d`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={r.overdue ? "bad" : STATUS_TONE[r.status] ?? "muted"}>
                      {r.overdue ? "OVERDUE" : r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="space-y-3.5">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            {[
              { l: "Activities", v: String(rows.length) },
              { l: "Finished on time", v: String(onTime.length) },
              { l: "Slipped", v: String(slipped.length) },
              { l: "Total slip", v: `${totalSlip}d` },
              { l: "Extensions approved", v: String(extensions.filter((e) => e.status === "APPROVED").length) },
            ].map((k) => (
              <Card key={k.l} className="px-4 py-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">{k.l}</p>
                <p className="num mt-1 font-display text-[22px] font-bold text-navy-950">{k.v}</p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Where the time went</CardTitle>
              <span className="text-xs text-muted-500">The activities carrying the slip, worst first.</span>
            </CardHeader>
            <CardBody className="p-0">
              {worst.length === 0 ? (
                <p className="px-4 py-12 text-center text-[12px] font-medium text-muted-500">
                  Nothing has slipped against baseline.
                </p>
              ) : (
                <ul className="divide-y divide-line-200">
                  {worst.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold text-navy-950">{r.name}</p>
                        <p className="text-[11px] font-medium text-muted-500">
                          baseline {formatDate(r.baselineEnd)} → {r.actualEnd ? "finished" : "now planned"} {formatDate(r.actualEnd ?? r.plannedEnd)}
                        </p>
                      </div>
                      <div className="h-1.5 w-[140px] shrink-0 overflow-hidden rounded-full bg-line-300">
                        <div
                          className="h-full rounded-full bg-bad-600"
                          style={{ width: `${Math.min(100, ((r.slipDays ?? 0) / Math.max(1, worst[0].slipDays ?? 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="num w-[52px] shrink-0 text-right text-[12px] font-bold text-bad-600">
                        +{r.slipDays}d
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Dependencies ------------------------------ */

/**
 * What an activity waits on. Adding a link reschedules the project straight
 * away, so the message says what moved rather than leaving it to be noticed.
 */
function DependencyModal({
  activity, candidates, onClose, onDone,
}: {
  activity: Activity;
  candidates: Activity[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [predecessorId, setPredecessorId] = React.useState("");
  const [type, setType] = React.useState<LinkType>("FS");
  const [lag, setLag] = React.useState("0");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const linked = new Set(activity.predecessors.map((p) => p.predecessorId));
  const options = candidates.filter((c) => !linked.has(c.id));
  const moved = (n: number) => (n > 0 ? ` ${n} downstream activit${n === 1 ? "y" : "ies"} moved.` : "");

  async function add() {
    setBusy("add");
    setError(null);
    const res = await addDependencyAction(activity.id, predecessorId, type, Number(lag));
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    const chosen = options.find((o) => o.id === predecessorId);
    onDone(`${activity.code} now waits on ${chosen?.code ?? "that activity"}.${moved(res.data.shifted)}`);
  }

  async function remove(dependencyId: string, code: string) {
    setBusy(dependencyId);
    setError(null);
    const res = await removeDependencyAction(dependencyId);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    onDone(`${activity.code} no longer waits on ${code}.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dependencies · ${activity.code}`}
      description="What this activity waits on. When any of them slips, this moves — and so does everything after it."
      size="md"
    >
      {error && <Alert tone="error">{error}</Alert>}

      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Waits on</p>
      {activity.predecessors.length === 0 ? (
        <p className="mb-4 text-[12.5px] font-medium text-muted-500">
          Nothing — this activity starts on its own planned date.
        </p>
      ) : (
        <ul className="mb-4 space-y-1.5">
          {activity.predecessors.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-[9px] border border-line-300 px-3 py-2">
              <span className="num shrink-0 text-[11px] font-bold text-muted-500">{p.code}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-navy-900">{p.name}</span>
              <Badge tone="slate">
                {LINK_LABEL[p.type as LinkType] ?? p.type}
                {p.lagDays ? ` · ${p.lagDays > 0 ? "+" : ""}${p.lagDays}d` : ""}
              </Badge>
              <button
                type="button"
                title="Remove link"
                disabled={busy !== null}
                onClick={() => remove(p.id, p.code)}
                className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Add a link</p>
      {options.length === 0 ? (
        <p className="text-[12.5px] font-medium text-muted-500">
          Every other activity in this project is already linked.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_96px]">
          <Field label="Waits on">
            <Select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
              <option value="">Choose an activity…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Link">
            <Select value={type} onChange={(e) => setType(e.target.value as LinkType)}>
              {LINK_TYPES.map((t) => <option key={t} value={t}>{LINK_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Lag (days)">
            <Input type="number" step={1} value={lag} onChange={(e) => setLag(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={add} loading={busy === "add"} disabled={!predecessorId || busy !== null}>
          Add link
        </Button>
      </div>
    </Modal>
  );
}
