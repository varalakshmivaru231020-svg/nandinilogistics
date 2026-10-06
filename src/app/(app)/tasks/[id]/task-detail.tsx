"use client";

import * as React from "react";

import { waitingLevel, type FlowItem, type FlowLevel } from "@/lib/tasks/checklist-flow";
import { useRouter } from "next/navigation";
import type { TaskKind, TaskPriority, TaskStatus } from "@prisma/client";

import {
  Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import {
  acceptTaskAction, addCommentAction, closeTaskAction, reviewChecklistItemAction,
  completeTaskAction, decideExtensionAction, deleteCommentAction,
  editCommentAction, reopenTaskAction, requestExtensionAction,
  sendBackTaskAction, startTaskAction,
} from "../actions";

interface Task {
  id: string; taskNo: string; title: string; description: string | null;
  kind: TaskKind; status: TaskStatus; priority: TaskPriority; round: number;
  projectCode: string | null; location: string | null;
  assignee: string; assigner: string;
  dueAt: string; originalDueAt: string; effectiveDueAt: string;
  completionRemark: string | null; closureRemark: string | null;
}
interface Level {
  id: string; kind: "REVIEW" | "APPROVAL"; level: number; person: string; isViewer: boolean;
  actions: Array<{ round: number; decision: string; remark: string; actor: string; actedAt: string }>;
}
/** A checklist line: a number, a title, and every judgement on it. */
interface Item {
  id: string;
  /** This point's own round. Only verdicts from it still stand. */
  round: number;
  text: string;
  marked: boolean;
  markedAt: string | null;
  /** What the assignee said about it — APPROVE or DENY — and why. */
  verdict: string | null;
  remark: string | null;
  markedBy: string | null;
  files: Array<{ id: string; fileName: string }>;
  reviews: Array<{
    round: number; verdict: string; remark: string | null;
    kind: string; level: number; by: string; actedAt: string;
  }>;
}

/**
 * One task, and everything that has happened to it.
 *
 * Which buttons appear is decided on the server by the lifecycle rules and
 * passed down; nothing here decides who may act, it only draws what the server
 * already allowed. The action checks again regardless.
 */
export function TaskDetail({
  task, levels, checklists, comments, extensions, files, history, can, nowMs, stage, stageWho, nextUp,
  flowLevels, isAdmin, viewerId,
}: {
  /** The levels a point travels through, in the shape the flow rules read. */
  flowLevels: FlowLevel[];
  isAdmin: boolean;
  /** Where a checklist task is standing, and who is holding it. */
  stage: string | null;
  stageWho: string | null;
  /** Who it reaches after the level holding it now. */
  nextUp: string | null;
  task: Task;
  levels: Level[];
  checklists: Array<{ id: string; name: string; items: Item[] }>;
  comments: Array<{
    id: string; body: string; author: string; mine: boolean; createdAt: string;
    editedAt: string | null; edits: number;
    files: Array<{ id: string; fileName: string; fileSize: number }>;
  }>;
  extensions: Array<{
    id: string; proposedDueAt: string; reason: string; isHoldRequest: boolean;
    status: string; control: string | null; revisedDueAt: string | null;
    decisionRemark: string | null; requestedBy: string; decidedBy: string | null; requestedAt: string;
  }>;
  files: Array<{ id: string; fileName: string; fileSize: number; by: string; at: string }>;
  history: Array<{ id: string; summary: string; remark: string | null; actor: string; at: string }>;
  can: Record<string, boolean>;
  viewerId: string;
  nowMs: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState<null | "complete" | "close" | "sendBack" | "reopen">(null);
  const [remark, setRemark] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);
  // Checklist / Review and approval / History, as horizontal tabs. A plain task
  // has no checklist, so it opens on the history it does have.
  const hasChecklist = checklists.length > 0;
  // How many points are standing in front of this viewer right now.
  const judgedLeft = checklists.reduce(
    (n, c) => n + c.items.filter((i) => {
      const at = waitingLevel(
        {
          id: i.id, round: i.round,
          verdicts: i.reviews.map((r) => ({
            kind: r.kind as "REVIEW" | "APPROVAL", level: r.level, round: r.round,
            verdict: r.verdict as "PASS" | "FAIL",
          })),
        },
        flowLevels,
      );
      return at !== null && (at.userId === viewerId || isAdmin);
    }).length,
    0,
  );
  /** One checklist row as the flow rules see it. */
  const flowOf = React.useCallback(
    (item: Item): FlowItem => ({
      id: item.id,
      round: item.round,
      verdicts: item.reviews.map((r) => ({
        kind: r.kind as "REVIEW" | "APPROVAL", level: r.level, round: r.round,
        verdict: r.verdict as "PASS" | "FAIL",
      })),
    }),
    [],
  );

  /**
   * Whether this point is standing in front of someone this viewer is.
   *
   * `can.review` and `can.approve` come from the server and already carry the
   * status gate, so a task that has not been started offers nothing — the
   * points are in front of reviewer 1 in principle, but not yet in fact.
   */
  const mineToJudge = React.useCallback(
    (item: Item) => {
      if (!can.review && !can.approve) return false;
      const at = waitingLevel(flowOf(item), flowLevels);
      return at !== null && (at.userId === viewerId || isAdmin);
    },
    [flowOf, flowLevels, viewerId, isAdmin, can.review, can.approve],
  );

  const TABS = [
    ...(hasChecklist ? [["checklist", "Checklist"] as const] : []),
    ...(levels.length > 0 ? [["levels", "Review and approval"] as const] : []),
    ["history", "History"] as const,
  ];
  const [tab, setTab] = React.useState<string>(TABS[0][0]);

  const over = isOverdue(task, nowMs);
  const waiting = extensions.find((e) => e.status === "REQUESTED");

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Something went wrong."); return false; }
    toast(done);
    setPrompt(null);
    setRemark("");
    router.refresh();
    return true;
  }

  return (
    <div className="animate-fade-up space-y-3.5">
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-line-300 bg-surface-sunken px-5 py-4">
          <div className="min-w-0 flex-[1_1_280px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-[12px] font-bold text-muted-500">{task.taskNo}</span>
              <span className="rounded-full bg-surface-field px-2.5 py-1 text-[10.5px] font-bold text-navy-600">
                {STATUS_LABEL[task.status]}
              </span>
              {/*
                No round on the task any more: each point carries its own, and
                a task-level one would be a number that means nothing. How far
                the checklist has got is on the list itself.
              */}
              {task.kind === "CHECKLIST" && (
                <span className="rounded-full bg-[#EDE7FB] px-2.5 py-1 text-[10.5px] font-bold text-[#5B3FA8]">
                  Checklist
                </span>
              )}
              {stage && (
                <span className="rounded-full bg-[#DCD2F5] px-2.5 py-1 text-[10.5px] font-bold text-[#4A2F94]">
                  {stage}{stageWho ? ` · ${stageWho}` : ""}
                </span>
              )}
              {over && (
                <span className="rounded-full bg-bad-600 px-2.5 py-1 text-[10px] font-extrabold tracking-[.06em] text-white">
                  OVERDUE
                </span>
              )}
            </div>
            <h1 className="mt-1.5 font-display text-[17px] font-bold text-navy-950">{task.title}</h1>
            {task.description && (
              <p className="mt-1 text-[12.5px] font-medium text-muted-600">{task.description}</p>
            )}
          </div>

          <dl className="grid flex-[1_1_320px] grid-cols-2 gap-x-4 gap-y-2">
            <Pair k="Assignee" v={task.assignee} />
            <Pair k="Assigned by" v={task.assigner} />
            <Pair k="Due" v={formatDateTime(task.dueAt)} tone={over ? "bad" : undefined} />
            <Pair k="Priority" v={task.priority[0] + task.priority.slice(1).toLowerCase()} />
            {task.dueAt !== task.originalDueAt && (
              <Pair k="Originally due" v={formatDateTime(task.originalDueAt)} />
            )}
            {task.effectiveDueAt !== task.dueAt && (
              <Pair k="Scored against" v={formatDateTime(task.effectiveDueAt)} />
            )}
            {(task.projectCode || task.location) && (
              <Pair k="Where" v={[task.projectCode, task.location].filter(Boolean).join(" · ")} />
            )}
          </dl>
        </div>

        <CardBody className="flex flex-wrap gap-2">
          {can.accept && <Button size="sm" loading={busy} onClick={() => run(() => acceptTaskAction(task.id), "Task accepted.")}>Accept</Button>}
          {can.start && <Button size="sm" loading={busy} onClick={() => run(() => startTaskAction(task.id), "Work started.")}>Start work</Button>}
          {can.complete && (
            <Button size="sm" variant="success" onClick={() => { setPrompt("complete"); setRemark(""); }}>
              {task.kind === "CHECKLIST" ? "Mark complete and close" : "Mark complete"}
            </Button>
          )}

          {can.close && <Button size="sm" variant="success" onClick={() => { setPrompt("close"); setRemark(""); }}>Approve and close</Button>}
          {can.sendBack && <Button size="sm" variant="outline" onClick={() => { setPrompt("sendBack"); setRemark(""); }}>Send back for rework</Button>}
          {can.reopen && <Button size="sm" variant="outline" onClick={() => { setPrompt("reopen"); setRemark(""); }}>Reopen</Button>}
          {can.requestExtension && !waiting && (
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>Request extension or hold</Button>
          )}
          {(can.review || can.approve) && (
            <span className="text-[12px] font-medium text-muted-600">
              {judgedLeft > 0
                ? `${judgedLeft} checklist point${judgedLeft === 1 ? "" : "s"} left for you to approve or deny.`
                : "Every point judged — this level is done."}
            </span>
          )}

          {/*
            A button that simply vanishes reads as a fault. Once the task is with
            a level, say so and say why completing is not on offer.
          */}
          {!can.review && !can.approve && stage && (
            <span className="text-[12px] font-medium text-muted-600">
              {stage}{stageWho ? ` · ${stageWho}` : ""}. It can be completed once every level has
              signed off.
            </span>
          )}

          {task.status === "CLOSED" && !can.reopen && (
            <span className="text-[12px] font-medium text-muted-500">This task is closed and read-only.</span>
          )}
        </CardBody>

        {(task.completionRemark || task.closureRemark) && (
          <div className="border-t border-line-200 px-5 py-3.5 text-[12px]">
            {task.completionRemark && <p><b className="text-navy-900">Closure remark:</b> {task.completionRemark}</p>}
            {task.closureRemark && <p className="mt-1"><b className="text-navy-900">Assigner:</b> {task.closureRemark}</p>}
          </div>
        )}
      </Card>

      {waiting && (
        <Card>
          <CardHeader><CardTitle>{waiting.isHoldRequest ? "Hold requested" : "Extension requested"}</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-[12.5px]">
            <p>
              <b>{waiting.requestedBy}</b> proposes <b>{formatDateTime(waiting.proposedDueAt)}</b> — {waiting.reason}
            </p>
            {can.decideExtension ? (
              <Button size="sm" onClick={() => setDeciding(waiting.id)}>Decide</Button>
            ) : (
              <p className="text-[11.5px] font-medium text-muted-500">
                The task keeps its status and date until the Assigner decides.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Checklist · Review and approval · History, side by side. */}
      <div className="flex flex-wrap gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "cursor-pointer rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold transition-colors",
              tab === key
                ? "border-brand-500 bg-brand-100 text-brand-700"
                : "border-line-400 bg-white text-muted-600 hover:border-brand-500",
            )}
          >
            {label}
          </button>
        ))}
        {nextUp && (
          <>
            <div className="flex-1" />
            <span className="text-[11.5px] font-medium text-muted-500">Next: {nextUp}</span>
          </>
        )}
      </div>

      {tab === "checklist" && checklists.map((cl) => (
        <ChecklistCard
          key={cl.id}
          list={cl}
          flowLevels={flowLevels}
          flowOf={flowOf}
          mineToJudge={mineToJudge}
          judgeLabel={can.review ? "Yours to review" : "Yours to approve"}
          onDone={() => router.refresh()}
        />
      ))}

      {tab === "levels" && levels.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line-300 bg-surface-sunken px-5 py-4">
            <h3 className="font-display text-[14px] font-bold text-navy-950">Review and approval</h3>
            <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">
              One person a level, in order. Each point is judged on its own: a denial sends that
              point back to reviewer level 1 and leaves the rest where they are.
            </p>
          </div>

          <div className="divide-y divide-line-150">
            {levels.map((l) => {
              /*
               * A level is not "done" or "pending" any more — it holds some
               * number of points and has passed some others. That count is the
               * honest reading, and it is what tells someone whether there is
               * anything for them to do.
               */
              const all = checklists.flatMap((c) => c.items);
              const here = all.filter((item) => {
                const at = waitingLevel(flowOf(item), flowLevels);
                return at !== null && at.kind === l.kind && at.level === l.level;
              });
              const past = all.filter((item) =>
                item.reviews.some(
                  (r) => r.round === item.round && r.kind === l.kind && r.level === l.level && r.verdict === "PASS",
                ),
              );
              const holding = here.length > 0;
              return (
                <div key={l.id} className={cn("px-5 py-3.5", holding && "bg-brand-100/40")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cn(
                      "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                      holding
                        ? "bg-brand-500 text-white"
                        : past.length === all.length && all.length > 0
                          ? "bg-good-600 text-white"
                          : "bg-surface-field text-muted-500",
                    )}>
                      {!holding && past.length === all.length && all.length > 0 ? "✓" : l.level}
                    </span>
                    <span className="w-[112px] shrink-0 text-[11px] font-bold uppercase tracking-[.06em] text-muted-400">
                      {l.kind === "REVIEW" ? "Reviewer" : "Approver"} L{l.level}
                    </span>
                    <span className="min-w-[120px] flex-1 text-[13px] font-semibold text-navy-900">
                      {l.person}{l.isViewer && <span className="text-muted-400"> (you)</span>}
                    </span>
                    {holding ? (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-brand-700">
                        {here.length} point{here.length === 1 ? "" : "s"} with them
                      </span>
                    ) : past.length === all.length && all.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-good-050 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-good-700">
                        Passed every point
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] font-medium text-muted-400">
                        {past.length} of {all.length} passed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {extensions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Extensions</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {extensions.map((e) => (
              <div key={e.id} className="rounded-[10px] border border-line-300 px-3.5 py-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-navy-900">
                    {e.isHoldRequest ? "Hold" : "Extension"} · {e.status.toLowerCase()}
                  </span>
                  {e.control && (
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                      e.control === "UNCONTROLLABLE" ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-800",
                    )}>
                      {e.control.toLowerCase()}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-muted-600">
                  {e.requestedBy} asked for {formatDateTime(e.proposedDueAt)} — {e.reason}
                </p>
                {e.revisedDueAt && (
                  <p className="mt-0.5 text-muted-600">
                    {e.decidedBy} set {formatDateTime(e.revisedDueAt)}{e.decisionRemark ? ` — ${e.decisionRemark}` : ""}
                  </p>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {files.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
          <CardBody className="space-y-1.5">
            {files.map((f) => (
              <p key={f.id} className="text-[12px]">
                <a
                  href={`/api/tasks/attachments/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-brand-700 hover:underline"
                >
                  {f.fileName}
                </a>{" "}
                <span className="num text-muted-500">{Math.max(1, Math.round(f.fileSize / 1024))} KB</span>{" "}
                <span className="text-muted-400">· {f.by}, {formatDateTime(f.at)}</span>
              </p>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === "history" && (
      <>
      <Card>
        <CardHeader><CardTitle>Comments</CardTitle></CardHeader>
        <CardBody className="space-y-2.5">
          {comments.length === 0 && (
            <p className="text-[12px] font-medium text-muted-400">Nothing said yet.</p>
          )}
          {comments.map((c) => (
            <Comment key={c.id} comment={c} canDelete={can.deleteComment} onDone={() => router.refresh()} />
          ))}
          {can.comment && <CommentBox taskId={task.id} onDone={() => router.refresh()} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardBody className="space-y-1.5">
          {history.map((h) => (
            <p key={h.id} className="text-[12px]">
              <span className="num text-muted-400">{formatDateTime(h.at)}</span>{" "}
              <b className="text-navy-900">{h.actor}</b> — {h.summary}
              {h.remark && <span className="text-muted-600"> · {h.remark}</span>}
            </p>
          ))}
        </CardBody>
      </Card>
      </>
      )}

      {prompt && (
        <RemarkModal
          title={{
            complete: task.kind === "CHECKLIST" ? "Complete and close this task" : "Mark this task complete",
            close: "Approve and close",
            sendBack: "Send back for rework",
            reopen: "Reopen this closed task",
          }[prompt]}
          hint={{
            complete: task.kind === "CHECKLIST"
              ? "Every level has signed off. A closure remark is required, and this closes the task."
              : "A closure remark is required.",
            close: "A remark is required, and goes on the record.",
            sendBack: "Say what needs redoing — the Assignee will see it.",
            reopen: "Say why it is being reopened.",
          }[prompt]}
          value={remark}
          onChange={setRemark}
          busy={busy}
          onClose={() => setPrompt(null)}
          onConfirm={() => {
            const work = {
              complete: () => completeTaskAction(task.id, remark),
              close: () => closeTaskAction(task.id, remark),
              sendBack: () => sendBackTaskAction(task.id, remark),
              reopen: () => reopenTaskAction(task.id, remark),
            }[prompt];
            void run(work, "Done.");
          }}
        />
      )}

      {asking && <ExtensionModal taskId={task.id} onClose={() => setAsking(false)} onDone={() => router.refresh()} />}
      {deciding && (
        <DecideExtensionModal
          extensionId={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Pair({ k, v, tone }: { k: string; v: string; tone?: "bad" }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">{k}</dt>
      <dd className={cn("mt-0.5 text-[12.5px] font-semibold", tone === "bad" ? "text-bad-600" : "text-navy-900")}>{v}</dd>
    </div>
  );
}

function RemarkModal({
  title, hint, value, onChange, busy, onClose, onConfirm,
}: {
  title: string; hint: string; value: string; onChange: (v: string) => void;
  busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal
      open onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!value.trim()} onClick={onConfirm}>Confirm</Button>
        </>
      }
    >
      <Field label="Remark" required hint={hint}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      </Field>
    </Modal>
  );
}

function ExtensionModal({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hold, setHold] = React.useState(false);
  const form = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestExtensionAction(taskId, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast("Request sent to the assigner.");
    onClose();
    onDone();
  }

  return (
    <Modal
      open onClose={onClose} title="Request an extension" size="sm"
      description="The assigner sets the final date and decides whether the delay was in your control."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => form.current?.requestSubmit()}>Send request</Button>
        </>
      }
    >
      <form ref={form} onSubmit={submit} className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-navy-900">
          <input type="checkbox" name="isHoldRequest" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          Pause the task as well (Hold)
        </label>
        <Field label="Proposed due date and time" required>
          <Input type="datetime-local" name="proposedDueAt" required />
        </Field>
        {hold && (
          <Field label="Expected resume date">
            <Input type="datetime-local" name="expectedResumeAt" />
          </Field>
        )}
        <Field label="Reason" required>
          <Textarea name="reason" rows={3} required />
        </Field>
        <Field label="Attachment">
          <input type="file" name="files" multiple className="text-[12px]" />
        </Field>
      </form>
    </Modal>
  );
}

function DecideExtensionModal({
  extensionId, onClose, onDone,
}: { extensionId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [approve, setApprove] = React.useState(true);
  const [control, setControl] = React.useState<"CONTROLLABLE" | "UNCONTROLLABLE">("UNCONTROLLABLE");
  const [revised, setRevised] = React.useState("");
  const [remark, setRemark] = React.useState("");

  async function go() {
    setBusy(true);
    setError(null);
    const res = await decideExtensionAction(
      extensionId, approve, remark, approve ? control : undefined, approve && revised ? revised : undefined,
    );
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(approve ? "Extension approved." : "Extension rejected.");
    onClose();
    onDone();
  }

  return (
    <Modal
      open onClose={onClose} title="Decide the extension" size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!remark.trim()} onClick={go}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button size="sm" variant={approve ? "success" : "outline"} onClick={() => setApprove(true)}>Approve</Button>
          <Button size="sm" variant={approve ? "outline" : "danger"} onClick={() => setApprove(false)}>Reject</Button>
        </div>
        {approve && (
          <>
            <Field label="Was the delay in the assignee's control?" required
                   hint="Only an uncontrollable delay moves the date their performance is measured against.">
              <Select value={control} onChange={(e) => setControl(e.target.value as never)}>
                <option value="UNCONTROLLABLE">Uncontrollable</option>
                <option value="CONTROLLABLE">Controllable</option>
              </Select>
            </Field>
            <Field label="Revised due date" hint="Leave blank to accept the date they proposed.">
              <Input type="datetime-local" value={revised} onChange={(e) => setRevised(e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Remark" required>
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * The checklist on a task, and the whole of its story.
 *
 * It is worked and judged in one place. The assignee ticks each line off while
 * the task is open; whoever holds the active level approves or denies the same
 * lines, with a remark if they have one; and every verdict any round has given
 * stays stacked beneath the line it was about. A dialog could not do that — the
 * remark has to sit under the point it is about to be worth reading.
 */
function ChecklistCard({
  list, flowLevels, flowOf, mineToJudge, judgeLabel, onDone,
}: {
  list: { id: string; name: string; items: Item[] };
  flowLevels: FlowLevel[];
  flowOf: (item: Item) => FlowItem;
  mineToJudge: (item: Item) => boolean;
  judgeLabel: string;
  onDone: () => void;
}) {
  // Progress is how many points are through every level — the only reading that
  // means the same thing at each step, now that points travel separately.
  const done = list.items.filter((i) => waitingLevel(flowOf(i), flowLevels) === null).length;
  const mine = list.items.filter(mineToJudge).length;
  const pct = list.items.length ? Math.round((done / list.items.length) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-300 bg-surface-sunken px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-[14px] font-bold text-navy-950">{list.name}</h3>
          <span className="rounded-full bg-[#EDE7FB] px-2.5 py-1 text-[10.5px] font-bold text-[#5B3FA8]">
            {done} of {list.items.length} approved
          </span>
          {mine > 0 && (
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[10.5px] font-bold text-brand-700">
              {judgeLabel} · {mine}
            </span>
          )}
        </div>
        <div className="mt-2.5 h-[7px] overflow-hidden rounded-full bg-line-200">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${pct}%`,
              background: pct === 100
                ? "linear-gradient(90deg,#1F9D66,#5BC8A2)"
                : "linear-gradient(90deg,#6C4FC4,#A98FE8)",
            }}
          />
        </div>
      </div>

      <div className="divide-y divide-line-150">
        {list.items.map((item, i) => (
          <ChecklistRow
            key={item.id}
            item={item}
            index={i}
            at={waitingLevel(flowOf(item), flowLevels)}
            canJudge={mineToJudge(item)}
            onDone={onDone}
          />
        ))}
      </div>
    </Card>
  );
}

/** One line: its number, its title, what has been done to it, and what was said. */
/**
 * One line of the checklist: its number, its title, and every judgement on it.
 *
 * Approve or deny is the only verdict anyone gives here — the person doing the
 * work, the reviewers above them and the approvers above those — each with a
 * remark and photographs if they have them, and none of it required. The same
 * control serves all three; who is allowed to use it is decided on the server
 * and passed down.
 */
function ChecklistRow({
  item, index, at, canJudge, onDone,
}: {
  item: Item;
  index: number;
  /** The level this point is standing in front of, or null once it is through. */
  at: FlowLevel | null;
  /** Whether that level is one the viewer holds. */
  canJudge: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [writing, setWriting] = React.useState<null | "APPROVE" | "DENY">(null);
  const [remark, setRemark] = React.useState("");
  const files = React.useRef<HTMLInputElement>(null);

  const thisRound = item.reviews.filter((r) => r.round === item.round);
  /*
   * A point waiting on a level has no verdict from that level yet, so this is
   * only ever set once the point has moved past it — which is what turns the
   * buttons into a badge. A point that is through every level shows the last
   * word on it.
   */
  const settled = at
    ? thisRound.find((r) => r.kind === at.kind && r.level === at.level) ?? null
    : (thisRound[thisRound.length - 1] ?? null);
  const denied = thisRound.some((r) => r.verdict === "FAIL");

  async function send(verdict: "APPROVE" | "DENY") {
    setBusy(true);
    const fd = new FormData();
    fd.set("verdict", verdict);
    fd.set("remark", remark);
    for (const f of Array.from(files.current?.files ?? [])) fd.append("files", f);
    await reviewChecklistItemAction(item.id, fd);
    setBusy(false);
    setWriting(null);
    setRemark("");
    onDone();
  }

  return (
    <div className={cn("px-5 py-3.5", denied && "bg-bad-025")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn(
          "num mt-[1px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] text-[11px] font-extrabold",
          settled
            ? settled.verdict === "FAIL" ? "bg-bad-600 text-white" : "bg-good-600 text-white"
            : "bg-surface-field text-navy-500",
        )}>
          {settled ? (settled.verdict === "FAIL" ? "✕" : "✓") : String(index + 1).padStart(2, "0")}
        </span>

        <span className="min-w-[180px] flex-1 text-[13px] font-semibold text-navy-900">{item.text}</span>

        {canJudge && (
          settled ? (
            <span className="flex shrink-0 items-center gap-2">
              <span className={cn(
                "rounded-[8px] px-3 py-1.5 text-[11px] font-bold",
                settled.verdict === "FAIL" ? "bg-bad-600 text-white" : "bg-good-600 text-white",
              )}>
                {settled.verdict === "FAIL" ? "Denied" : "Approved"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setWriting(settled.verdict === "FAIL" ? "DENY" : "APPROVE"); setRemark(settled.remark ?? ""); }}
                className="cursor-pointer text-[11px] font-semibold text-brand-700 hover:underline disabled:opacity-60"
              >
                Change
              </button>
            </span>
          ) : (
            <span className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setWriting("APPROVE"); setRemark(""); }}
                className="cursor-pointer rounded-[8px] border border-good-400 bg-white px-3 py-1.5 text-[11px] font-bold text-good-700 transition-colors hover:bg-good-050 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setWriting("DENY"); setRemark(""); }}
                className="cursor-pointer rounded-[8px] border border-bad-300 bg-white px-3 py-1.5 text-[11px] font-bold text-bad-700 transition-colors hover:bg-bad-050 disabled:opacity-60"
              >
                Deny
              </button>
            </span>
          )
        )}
      </div>

      {writing && (
        <div className="mt-2.5 space-y-2 rounded-[10px] border border-line-300 bg-surface-sunken p-3 pl-[38px]">
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={writing === "DENY" ? "What is wrong with it? (optional)" : "A remark, if you have one (optional)"}
            autoFocus
            className="w-full rounded-[8px] border border-line-400 bg-white px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={files} type="file" name="files" multiple accept="image/*,.pdf" className="flex-1 text-[11.5px]" />
            <Button
              size="xs"
              loading={busy}
              variant={writing === "DENY" ? "danger" : "success"}
              onClick={() => send(writing)}
            >
              {writing === "DENY" ? "Deny" : "Approve"}
            </Button>
            <Button size="xs" variant="outline" onClick={() => setWriting(null)}>Cancel</Button>
          </div>
          <p className="text-[10.5px] font-medium text-muted-400">
            The remark and the photographs are both optional.
          </p>
        </div>
      )}

      {/* Every level that has judged this line, in order. */}
      {(item.reviews.length > 0 || item.files.length > 0) && (
        <div className="mt-2.5 space-y-1.5 pl-[38px]">
          {item.reviews.map((r, i) => (
            <Verdict
              key={i}
              label={`${r.kind === "REVIEW" ? "Reviewer" : "Approver"} L${r.level}`}
              who={r.by}
              at={r.actedAt}
              failed={r.verdict === "FAIL"}
              remark={r.remark}
              note={r.round !== item.round ? `round ${r.round}` : undefined}
            />
          ))}
          {item.files.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {item.files.map((f) => (
                <a
                  key={f.id}
                  href={`/api/tasks/checklist-files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[7px] border border-line-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:border-brand-500"
                >
                  {f.fileName}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One judgement on a line, in the same shape whoever gave it. */
function Verdict({
  label, who, at, failed, remark, note,
}: {
  label: string;
  who: string;
  at: string | null;
  failed: boolean;
  remark: string | null;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={cn(
        "shrink-0 rounded-full px-2 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[.06em]",
        failed ? "bg-bad-050 text-bad-700" : "bg-good-050 text-good-700",
      )}>
        {failed ? "Denied" : "Approved"}
      </span>
      <span className="text-[11.5px] font-semibold text-navy-700">{label} · {who}</span>
      {at && (
        <span className="num text-[10.5px] font-medium text-muted-400">
          {formatDateTime(at)}{note ? ` · ${note}` : ""}
        </span>
      )}
      {remark && <span className="w-full text-[12px] font-medium text-muted-600">{remark}</span>}
    </div>
  );
}


function Comment({
  comment, canDelete, onDone,
}: {
  comment: {
    id: string; body: string; author: string; mine: boolean; createdAt: string;
    editedAt: string | null; edits: number; files: Array<{ id: string; fileName: string; fileSize: number }>;
  };
  canDelete: boolean;
  onDone: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [body, setBody] = React.useState(comment.body);
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="rounded-[10px] border border-line-300 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-navy-900">{comment.author}</span>
        <span className="num text-[11px] font-medium text-muted-400">{formatDateTime(comment.createdAt)}</span>
        {comment.editedAt && (
          <span className="text-[10.5px] font-medium text-muted-400">edited · {comment.edits} earlier version(s)</span>
        )}
        <div className="flex-1" />
        {comment.mine && !editing && (
          <button type="button" onClick={() => setEditing(true)}
                  className="cursor-pointer text-[11px] font-bold text-brand-700">Edit</button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={async () => { setBusy(true); await deleteCommentAction(comment.id); setBusy(false); onDone(); }}
            disabled={busy}
            className="cursor-pointer text-[11px] font-bold text-bad-600"
          >
            Delete
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
          <div className="flex gap-2">
            <Button size="xs" loading={busy} onClick={async () => {
              setBusy(true);
              await editCommentAction(comment.id, body);
              setBusy(false);
              setEditing(false);
              onDone();
            }}>Save</Button>
            <Button size="xs" variant="outline" onClick={() => { setEditing(false); setBody(comment.body); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[12.5px] text-navy-800">{comment.body}</p>
      )}

      {comment.files.map((f) => (
        <a
          key={f.id}
          href={`/api/tasks/attachments/${f.id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-[11.5px] font-semibold text-brand-700 hover:underline"
        >
          {f.fileName}
        </a>
      ))}
    </div>
  );
}

function CommentBox({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addCommentAction(taskId, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    form.current?.reset();
    onDone();
  }

  return (
    <form ref={form} onSubmit={submit} className="space-y-2 border-t border-line-200 pt-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea name="body" rows={2} placeholder="Add a comment…" />
      <div className="flex items-center gap-2">
        <input type="file" name="files" multiple className="flex-1 text-[11.5px]" />
        <Button size="sm" loading={busy} type="submit">Comment</Button>
      </div>
    </form>
  );
}
