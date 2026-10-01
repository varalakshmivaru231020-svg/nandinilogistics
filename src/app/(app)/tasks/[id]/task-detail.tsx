"use client";

import * as React from "react";
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
  acceptTaskAction, addCommentAction, closeTaskAction,
  completeTaskAction, decideExtensionAction, decideLevelAction, deleteCommentAction,
  editCommentAction, reopenTaskAction, requestExtensionAction, resubmitTaskAction,
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
/** A checklist line: a number, a title, and what each round said about it. */
interface Item {
  id: string;
  text: string;
  isMandatory: boolean;
  reviews: Array<{ round: number; verdict: string; remark: string | null; kind: string; level: number }>;
}

/**
 * One task, and everything that has happened to it.
 *
 * Which buttons appear is decided on the server by the lifecycle rules and
 * passed down; nothing here decides who may act, it only draws what the server
 * already allowed. The action checks again regardless.
 */
export function TaskDetail({
  task, levels, checklists, comments, extensions, files, history, can, nowMs, stage, nextUp,
}: {
  /** Where a checklist task is standing, in words. */
  stage: string | null;
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
  const [prompt, setPrompt] = React.useState<null | "complete" | "close" | "sendBack" | "reopen" | "resubmit">(null);
  const [remark, setRemark] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);
  const [levelChoice, setLevelChoice] = React.useState<null | "review" | "approve">(null);
  // Checklist / Review and approval / History, as horizontal tabs. A plain task
  // has no checklist, so it opens on the history it does have.
  const hasChecklist = checklists.length > 0;
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
              {task.kind === "CHECKLIST" && (
                <span className="rounded-full bg-[#EDE7FB] px-2.5 py-1 text-[10.5px] font-bold text-[#5B3FA8]">
                  Checklist · round {task.round}
                </span>
              )}
              {stage && (
                <span className="rounded-full bg-[#DCD2F5] px-2.5 py-1 text-[10.5px] font-bold text-[#4A2F94]">
                  {stage}
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
          {can.complete && <Button size="sm" variant="success" onClick={() => { setPrompt("complete"); setRemark(""); }}>Mark complete</Button>}
          {can.resubmit && <Button size="sm" variant="success" onClick={() => { setPrompt("resubmit"); setRemark(""); }}>Resubmit</Button>}
          {can.close && <Button size="sm" variant="success" onClick={() => { setPrompt("close"); setRemark(""); }}>Approve and close</Button>}
          {can.sendBack && <Button size="sm" variant="outline" onClick={() => { setPrompt("sendBack"); setRemark(""); }}>Send back for rework</Button>}
          {can.reopen && <Button size="sm" variant="outline" onClick={() => { setPrompt("reopen"); setRemark(""); }}>Reopen</Button>}
          {can.requestExtension && !waiting && (
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>Request extension or hold</Button>
          )}
          {can.review && <Button size="sm" onClick={() => { setLevelChoice("review"); setRemark(""); }}>Review this level</Button>}
          {can.approve && <Button size="sm" onClick={() => { setLevelChoice("approve"); setRemark(""); }}>Approve this level</Button>}
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
          round={task.round}
          canDecide={can.review || can.approve}
        />
      ))}

      {tab === "levels" && levels.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Review and approval</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {levels.map((l) => {
              const thisRound = l.actions.find((a) => a.round === task.round);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line-300 px-3.5 py-2.5">
                  <span className="w-[130px] shrink-0 text-[11.5px] font-bold text-navy-900">
                    {l.kind === "REVIEW" ? "Reviewer" : "Approver"} L{l.level}
                  </span>
                  <span className="flex-1 text-[12.5px] font-semibold text-navy-700">
                    {l.person}{l.isViewer && " (you)"}
                  </span>
                  {thisRound ? (
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                      ["PASS", "APPROVE"].includes(thisRound.decision)
                        ? "bg-good-050 text-good-700" : "bg-bad-050 text-bad-700",
                    )}>
                      {thisRound.decision}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-400">waiting</span>
                  )}
                  {thisRound?.remark && (
                    <span className="w-full text-[11.5px] font-medium text-muted-600">{thisRound.remark}</span>
                  )}
                </div>
              );
            })}
          </CardBody>
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
      )}

      {prompt && (
        <RemarkModal
          title={{
            complete: "Mark this task complete",
            resubmit: "Resubmit for review",
            close: "Approve and close",
            sendBack: "Send back for rework",
            reopen: "Reopen this closed task",
          }[prompt]}
          hint={{
            complete: "A closure remark is required.",
            resubmit: "Say what you corrected.",
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
              resubmit: () => resubmitTaskAction(task.id, remark),
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
      {levelChoice && (
        <LevelModal
          taskId={task.id}
          mode={levelChoice}
          items={checklists.flatMap((c) => c.items.map((i) => ({ id: i.id, text: i.text })))}
          nextUp={nextUp}
          onClose={() => setLevelChoice(null)}
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
 * A level's decision.
 *
 * The scope has a reviewer mark each checklist item Pass or Fail with a remark
 * and then give an overall verdict, so both are collected here; an approver
 * gives the overall verdict alone. Anything left unmarked is taken as a pass,
 * because a reviewer who says nothing about an item is not failing it.
 */
function LevelModal({
  taskId, mode, items, nextUp, onClose, onDone,
}: {
  taskId: string;
  mode: "review" | "approve";
  items: Array<{ id: string; text: string }>;
  /** Who it goes to if this level passes it. */
  nextUp: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pass, setPass] = React.useState(true);
  const [remark, setRemark] = React.useState("");
  const [verdicts, setVerdicts] = React.useState<Record<string, { verdict: "PASS" | "FAIL"; remark: string }>>({});
  const files = React.useRef<HTMLInputElement>(null);

  function setItem(id: string, patch: Partial<{ verdict: "PASS" | "FAIL"; remark: string }>) {
    setVerdicts((v) => ({
      ...v,
      [id]: { verdict: v[id]?.verdict ?? "PASS", remark: v[id]?.remark ?? "", ...patch },
    }));
  }

  async function go() {
    setBusy(true);
    setError(null);
    const anyFailed = Object.values(verdicts).some((v) => v.verdict === "FAIL");
    // A failed item cannot sit under an overall pass — the task has to go back.
    const overall = mode === "review" ? (pass && !anyFailed) : pass;
    const decision = mode === "review" ? (overall ? "PASS" : "FAIL") : (overall ? "APPROVE" : "REJECT");
    // A remark is welcome but not demanded: a reviewer who approves everything
    // has said what they came to say.
    const said = remark.trim() || (overall ? "Approved." : "Sent back.");
    const res = await decideLevelAction(
      taskId,
      decision,
      said,
      mode === "review"
        ? Object.entries(verdicts).map(([itemId, v]) => ({ itemId, verdict: v.verdict, remark: v.remark }))
        : [],
    );
    // Anything attached to the decision goes on the task, where the next level
    // and whoever did the work can both see it.
    const picked = files.current?.files;
    if (res.ok && picked && picked.length > 0) {
      const fd = new FormData();
      fd.set("body", said);
      for (const f of Array.from(picked)) fd.append("files", f);
      await addCommentAction(taskId, fd);
    }
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(`Recorded: ${decision.toLowerCase()}.`);
    onClose();
    onDone();
  }

  return (
    <Modal
      open onClose={onClose}
      title={mode === "review" ? "Review this level" : "Approve this level"}
      description="A fail or a reject sends the task back to the assignee, and the flow restarts at Reviewer Level 1."
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={go}>Record decision</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button size="sm" variant={pass ? "success" : "outline"} onClick={() => setPass(true)}>
            {mode === "review" ? "Pass" : "Approve"}
          </Button>
          <Button size="sm" variant={pass ? "outline" : "danger"} onClick={() => setPass(false)}>
            {mode === "review" ? "Fail" : "Reject"}
          </Button>
        </div>
        {mode === "review" && items.length > 0 && (
          <div className="space-y-1.5 rounded-[10px] border border-line-300 p-3">
            <p className="text-[11.5px] font-bold text-navy-900">Each item</p>
            {items.map((i) => {
              const v = verdicts[i.id]?.verdict ?? "PASS";
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-navy-800">{i.text}</span>
                  {(["PASS", "FAIL"] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setItem(i.id, { verdict: choice })}
                      className={cn(
                        "cursor-pointer rounded-[7px] border px-2.5 py-1 text-[10.5px] font-bold",
                        v === choice
                          ? choice === "PASS"
                            ? "border-good-600 bg-good-050 text-good-700"
                            : "border-bad-600 bg-bad-050 text-bad-700"
                          : "border-line-400 bg-white text-muted-500",
                      )}
                    >
                      {choice === "PASS" ? "Pass" : "Fail"}
                    </button>
                  ))}
                  {v === "FAIL" && (
                    <input
                      value={verdicts[i.id]?.remark ?? ""}
                      onChange={(e) => setItem(i.id, { remark: e.target.value })}
                      placeholder="What is wrong with it?"
                      className="w-full rounded-[7px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Field label="Overall remark" hint="Optional — it goes on the record either way.">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
        </Field>
        <Field label="Attachment" hint="Optional — a photo or a marked-up drawing.">
          <input ref={files} type="file" name="files" multiple className="text-[12px]" />
        </Field>
        {nextUp && pass && (
          <p className="text-[11.5px] font-medium text-muted-500">
            Passing this sends it to <b className="text-navy-900">{nextUp}</b>.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * The checklist on a task: a numbered list of lines to be approved or denied.
 *
 * Nobody fills anything in. The assignee does the work and the reviewers say,
 * item by item, whether it was done — which is where the judgement belongs and
 * why the items carry no fields of their own.
 */
function ChecklistCard({
  list, round, canDecide,
}: {
  list: { id: string; name: string; items: Item[] };
  round: number;
  canDecide: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{list.name}</CardTitle>
        <span className="text-xs text-muted-500">
          {list.items.length} point{list.items.length === 1 ? "" : "s"}
          {canDecide && " · approve or deny each as you review"}
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {list.items.map((item, i) => (
          <ChecklistRow key={item.id} item={item} index={i} round={round} />
        ))}
      </CardBody>
    </Card>
  );
}

/** One line, and what every round has said about it. */
function ChecklistRow({ item, index, round }: { item: Item; index: number; round: number }) {
  const thisRound = item.reviews.filter((r) => r.round === round);
  const earlier = item.reviews.filter((r) => r.round !== round);
  const denied = thisRound.some((r) => r.verdict === "FAIL");
  const passed = thisRound.length > 0 && !denied;

  return (
    <div className={cn(
      "rounded-[10px] border px-3.5 py-2.5",
      denied ? "border-bad-300 bg-bad-025" : passed ? "border-good-400 bg-good-050" : "border-line-300",
    )}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="num shrink-0 rounded-[7px] bg-surface-field px-2 py-[3px] text-[11px] font-extrabold text-navy-600">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-navy-900">{item.text}</span>
        {thisRound.map((r) => (
          <span
            key={`${r.kind}-${r.level}`}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em]",
              r.verdict === "FAIL" ? "bg-bad-600 text-white" : "bg-good-600 text-white",
            )}
          >
            {r.verdict === "FAIL" ? "Denied" : "Approved"} · L{r.level}
          </span>
        ))}
      </div>

      {thisRound.filter((r) => r.remark).map((r) => (
        <p key={`rm-${r.kind}-${r.level}`} className="mt-1.5 text-[11.5px] font-medium text-bad-700">
          {r.kind === "REVIEW" ? "Reviewer" : "Approver"} L{r.level}: {r.remark}
        </p>
      ))}

      {/* Earlier rounds stay readable, so a rework shows what it was for. */}
      {earlier.length > 0 && (
        <p className="mt-1 text-[11px] font-medium text-muted-400">
          {earlier.map((r) => (
            `Round ${r.round}: ${r.verdict === "FAIL" ? "denied" : "approved"} at ${r.kind === "REVIEW" ? "review" : "approval"} L${r.level}${r.remark ? ` — ${r.remark}` : ""}`
          )).join(" · ")}
        </p>
      )}
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
