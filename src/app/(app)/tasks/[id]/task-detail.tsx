"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import {
  addCommentAction, completeTaskAction, deleteCommentAction, editCommentAction,
  reopenTaskAction, startTaskAction,
} from "../actions";

interface Task {
  id: string; taskNo: string; title: string; description: string | null;
  status: TaskStatus; priority: TaskPriority;
  assignees: string[]; assigner: string;
  dueAt: string; startedAt: string | null; completedAt: string | null;
  completionRemark: string | null;
}

/**
 * One task, and everything that has happened to it.
 *
 * Which buttons appear is decided on the server by the lifecycle rules and
 * passed down; nothing here decides who may act, it only draws what the server
 * already allowed. The action checks again regardless.
 */
export function TaskDetail({
  task, comments, files, history, can, nowMs,
}: {
  task: Task;
  comments: Array<{
    id: string; body: string; author: string; mine: boolean; createdAt: string;
    editedAt: string | null; edits: number;
    files: Array<{ id: string; fileName: string; fileSize: number }>;
  }>;
  files: Array<{ id: string; fileName: string; fileSize: number; by: string; at: string }>;
  history: Array<{ id: string; summary: string; remark: string | null; actor: string; at: string }>;
  can: Record<string, boolean>;
  nowMs: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState<null | "complete" | "reopen">(null);
  const [remark, setRemark] = React.useState("");

  const over = isOverdue(task, nowMs);

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
            <Pair k="Assigned to" v={task.assignees.join(", ") || "—"} />
            <Pair k="Assigned by" v={task.assigner} />
            <Pair k="Due" v={formatDateTime(task.dueAt)} tone={over ? "bad" : undefined} />
            <Pair k="Priority" v={task.priority[0] + task.priority.slice(1).toLowerCase()} />
            {task.startedAt && <Pair k="Started" v={formatDateTime(task.startedAt)} />}
            {task.completedAt && <Pair k="Done" v={formatDateTime(task.completedAt)} />}
          </dl>
        </div>

        <CardBody className="flex flex-wrap gap-2">
          {can.start && <Button size="sm" loading={busy} onClick={() => run(() => startTaskAction(task.id), "Work started.")}>Start work</Button>}
          {can.complete && (
            <Button size="sm" variant="success" onClick={() => { setPrompt("complete"); setRemark(""); }}>
              Mark done
            </Button>
          )}
          {can.reopen && <Button size="sm" variant="outline" onClick={() => { setPrompt("reopen"); setRemark(""); }}>Reopen</Button>}
          {task.status === "DONE" && !can.reopen && (
            <span className="text-[12px] font-medium text-muted-500">This task is done. Only an Admin can reopen it.</span>
          )}
        </CardBody>

        {task.completionRemark && (
          <div className="border-t border-line-200 px-5 py-3.5 text-[12px]">
            <p><b className="text-navy-900">Closing remark:</b> {task.completionRemark}</p>
          </div>
        )}
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

      <Card>
        <CardHeader><CardTitle>Remarks</CardTitle></CardHeader>
        <CardBody className="space-y-2.5">
          {comments.length === 0 && (
            <p className="text-[12px] font-medium text-muted-400">Nothing said yet.</p>
          )}
          {comments.map((c) => (
            <Comment key={c.id} comment={c} canDelete={can.deleteComment || c.mine} onDone={() => router.refresh()} />
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

      {prompt && (
        <RemarkModal
          title={prompt === "complete" ? "Mark this task done" : "Reopen this task"}
          hint={prompt === "complete" ? "A remark is required and goes on the record." : "Say why it is being reopened."}
          value={remark}
          onChange={setRemark}
          busy={busy}
          onClose={() => setPrompt(null)}
          onConfirm={() => {
            const work = prompt === "complete"
              ? () => completeTaskAction(task.id, remark)
              : () => reopenTaskAction(task.id, remark);
            void run(work, "Done.");
          }}
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
      <Textarea name="body" rows={2} placeholder="Add a remark…" />
      <div className="flex items-center gap-2">
        <input type="file" name="files" multiple className="flex-1 text-[11.5px]" />
        <Button size="sm" loading={busy} type="submit">Add remark</Button>
      </div>
    </form>
  );
}
