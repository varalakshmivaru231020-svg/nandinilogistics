"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Diamond, Plus, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import { createActivityAction, setCriticalPathAction, updateActivityProgressAction } from "./actions";

interface Activity {
  id: string; code: string; name: string; sequence: number; status: string;
  progressPct: number; isMilestone: boolean; isCriticalPath: boolean;
  baselineStart: string | null; baselineEnd: string | null;
  plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  delayReason: string | null; delayNotes: string | null; workPackage: string | null;
}

const STATUS_TONE: Record<string, "slate" | "sky" | "green" | "red"> = {
  NOT_STARTED: "slate", IN_PROGRESS: "sky", COMPLETED: "green", DELAYED: "red",
};

const DAY = 86_400_000;

export function ScheduleScreen({
  projects, activeProjectId, activities, workPackages, delayReasons, can,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  activities: Activity[];
  workPackages: Array<{ id: string; code: string; name: string }>;
  delayReasons: Array<{ id: string; name: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [updating, setUpdating] = React.useState<Activity | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // The window the Gantt spans, from the earliest start to the latest finish.
  const bounds = React.useMemo(() => {
    const dates = activities.flatMap((a) =>
      [a.baselineStart, a.baselineEnd, a.plannedStart, a.plannedEnd, a.actualStart, a.actualEnd]
        .filter(Boolean)
        .map((d) => new Date(d!).getTime()),
    );
    if (dates.length === 0) return null;
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    return { min, max, span: Math.max(DAY, max - min) };
  }, [activities]);

  function bar(start: string | null, end: string | null) {
    if (!bounds || !start || !end) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return {
      left: `${((s - bounds.min) / bounds.span) * 100}%`,
      width: `${Math.max(0.6, ((e - s) / bounds.span) * 100)}%`,
    };
  }

  const delayed = activities.filter((a) => a.status === "DELAYED");
  const critical = activities.filter((a) => a.isCriticalPath);

  async function toggleCritical(a: Activity) {
    setBusy(a.id);
    setError(null);
    const res = await setCriticalPathAction(a.id, !a.isCriticalPath);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {projects.length > 1 && (
          <Select
            value={activeProjectId}
            onChange={(e) => router.push(`/schedule?project=${e.target.value}`)}
            className="w-56"
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {delayed.length > 0 && (
          <Badge tone="red">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {delayed.length} delayed
          </Badge>
        )}
        {can.viewCriticalPath && critical.length > 0 && (
          <Badge tone="amber">{critical.length} on the critical path</Badge>
        )}
        <div className="flex-1" />
        {can.create && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New activity
          </Button>
        )}
      </div>

      {activities.length === 0 ? (
        <Card>
          <EmptyState
            title="No schedule activities yet"
            description="Add activities to build the plan. The baseline is captured at creation and never edited, so slippage stays measurable."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Gantt</CardTitle>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              {can.viewBaseline && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded-sm bg-slate-300" /> Baseline
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded-sm bg-brand-500" /> Planned
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded-sm bg-emerald-500" /> Actual
              </span>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {bounds && (
              <div className="flex justify-between border-b border-slate-100 px-4 py-1.5 text-[11px] text-slate-400">
                <span>{formatDate(new Date(bounds.min).toISOString())}</span>
                <span>{formatDate(new Date(bounds.max).toISOString())}</span>
              </div>
            )}

            <ul className="divide-y divide-slate-100">
              {activities.map((a) => {
                const baseline = can.viewBaseline ? bar(a.baselineStart, a.baselineEnd) : null;
                const planned = bar(a.plannedStart, a.plannedEnd);
                const actual = bar(a.actualStart, a.actualEnd ?? new Date().toISOString());
                const slipped =
                  a.baselineEnd && a.plannedEnd && new Date(a.plannedEnd) > new Date(a.baselineEnd);

                return (
                  <li key={a.id} className={cn("px-4 py-2.5", a.status === "DELAYED" && "bg-red-50/40")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="w-64 shrink-0">
                        <div className="flex items-center gap-1.5">
                          {a.isMilestone && <Diamond className="h-3 w-3 fill-amber-400 text-amber-500" />}
                          <span className="text-sm font-medium text-slate-800">{a.name}</span>
                          {a.isCriticalPath && can.viewCriticalPath && (
                            <Zap className="h-3 w-3 fill-amber-400 text-amber-500" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          <code>{a.code}</code>
                          {a.workPackage && ` · ${a.workPackage}`}
                        </p>
                        {a.delayReason && (
                          <p className="mt-0.5 text-[11px] text-red-600">Delay: {a.delayReason}</p>
                        )}
                      </div>

                      <div className="relative min-w-48 flex-1 self-center">
                        <div className="relative h-8">
                          {baseline && (
                            <div className="absolute top-0 h-2 rounded-sm bg-slate-300"
                              style={baseline} title="Baseline" />
                          )}
                          {planned && (
                            <div className={cn("absolute h-2.5 rounded-sm", slipped ? "bg-amber-500" : "bg-brand-500")}
                              style={{ ...planned, top: baseline ? "10px" : "0px" }} title="Planned" />
                          )}
                          {actual && a.actualStart && (
                            <div className="absolute h-2 rounded-sm bg-emerald-500"
                              style={{ ...actual, top: baseline ? "22px" : "14px" }} title="Actual" />
                          )}
                        </div>
                      </div>

                      <div className="w-40 shrink-0 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="num text-xs font-medium text-slate-700">{a.progressPct}%</span>
                          <Badge tone={STATUS_TONE[a.status] ?? "slate"}>{a.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {formatDate(a.plannedStart)} – {formatDate(a.plannedEnd)}
                        </p>
                        <div className="mt-1 flex justify-end gap-1">
                          {can.updateProgress && (
                            <Button size="xs" variant="secondary" onClick={() => setUpdating(a)}>
                              Progress
                            </Button>
                          )}
                          {can.manageDependencies && (
                            <Button size="xs" variant="ghost" loading={busy === a.id}
                              onClick={() => toggleCritical(a)}>
                              <Zap className={cn("h-3 w-3", a.isCriticalPath && "fill-amber-400 text-amber-500")} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {creating && (
        <ActivityModal
          projectId={activeProjectId}
          workPackages={workPackages}
          onClose={() => setCreating(false)}
          onDone={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}

      {updating && (
        <ProgressModal
          activity={updating}
          delayReasons={delayReasons}
          onClose={() => setUpdating(null)}
          onDone={(m) => { setUpdating(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ActivityModal({
  projectId, workPackages, onClose, onDone,
}: {
  projectId: string;
  workPackages: Array<{ id: string; code: string; name: string }>;
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
      open
      onClose={onClose}
      title="New schedule activity"
      description="The dates you enter become the baseline. It is never edited afterwards."
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
          <Field label="Work package" className="sm:col-span-2">
            <Select name="workPackageId" defaultValue="">
              <option value="">— Not linked —</option>
              {workPackages.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </Select>
          </Field>
          <Field label="Planned start" required><Input name="plannedStart" type="date" required /></Field>
          <Field label="Planned finish" required><Input name="plannedEnd" type="date" required /></Field>
          <Field label="" className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="isMilestone" className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              This is a milestone
            </label>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function ProgressModal({
  activity, delayReasons, onClose, onDone,
}: {
  activity: Activity;
  delayReasons: Array<{ id: string; name: string }>;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [progress, setProgress] = React.useState(String(activity.progressPct));
  const [actualStart, setActualStart] = React.useState(activity.actualStart?.slice(0, 10) ?? "");
  const [actualEnd, setActualEnd] = React.useState(activity.actualEnd?.slice(0, 10) ?? "");
  const [delayReasonId, setDelayReasonId] = React.useState("");
  const [delayNotes, setDelayNotes] = React.useState(activity.delayNotes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Mirrors the server rule, so the requirement is visible before saving.
  const plannedEnd = activity.plannedEnd ? new Date(activity.plannedEnd) : null;
  const pct = Number(progress) || 0;
  const finishing = actualEnd ? new Date(actualEnd) : pct >= 100 ? new Date() : null;
  const late =
    plannedEnd !== null &&
    ((finishing !== null && finishing > plannedEnd) || (finishing === null && pct < 100 && new Date() > plannedEnd));
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
      open
      onClose={onClose}
      title={`Progress — ${activity.name}`}
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
