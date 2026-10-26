"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";

import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { CHANNELS, CHANNEL_ICON, CHANNEL_LABEL } from "@/lib/sales/follow-up-display";
import { addLeadNoteAction, changeLeadStageAction, logFollowUpAction } from "../actions";
import { PhoneLink } from "../leads-screen";
import { EditLeadModal, type EditLeadValues } from "./lead-edit-modal";
import { AssignModal } from "../assign-modal";

/* --------------------------------- Types --------------------------------- */

interface Lead {
  id: string; leadNo: string; name: string; phone: string; canCall: boolean; email: string | null;
  location: string | null; companies: string[];
  ownerName: string | null; ownerId: string | null;
  firstResponseMins: number | null;
  stageName: string; stageKind: string; requirement: string | null;
  /** Whatever Lead Settings adds to the form, in the order it asks. */
  customFields: Array<{ label: string; value: string }>;
  nextActionAt: string | null; lostReason: string | null; lostNotes: string | null;
  createdAt: string;
}
interface Step { id: string; name: string; kind: string; hasLine: boolean; done: boolean; current: boolean }
interface TimelineRow { id: string; text: string; by: string; at: string; action: string }
interface FollowUpRow { id: string; channel: string; stage: string | null; notes: string; outcome: string | null; by: string; at: string; nextActionAt: string | null }
interface NoteRow { id: string; body: string; by: string; at: string }
interface StageRow { id: string; from: string; to: string; by: string; at: string }
interface FileRow { id: string; title: string; fileName: string; fileSize: number; at: string }

export function LeadDetail({
  lead, stepper, timeline, followUps, notes, stageHistory, files,
  tab, edit, can, nowMs, lostReasons, owners, onboarding,
}: {
  /** The onboarding control the server draws once the lead reaches that stage. */
  onboarding?: React.ReactNode;
  /** The tele-callers this lead can be handed to. */
  owners: Array<{ id: string; name: string }>;
  lead: Lead;
  stepper: Step[];
  timeline: TimelineRow[];
  followUps: FollowUpRow[];
  notes: NoteRow[];
  stageHistory: StageRow[];
  files: FileRow[];
  /** The configured reasons a lead may be marked lost with. */
  lostReasons: Array<{ id: string; name: string }>;
  tab: string;
  /** The edit form's values and lookups; null when the viewer may not edit this lead. */
  edit: {
    lead: EditLeadValues;
    companies: Array<{ id: string; name: string }>;
  } | null;
  /*
   * Named, not Record<string, boolean>: a missing key used to read as
   * `undefined` and quietly disable the control it guarded.
   */
  can: {
    tabTimeline: boolean; tabFollowUps: boolean; tabNotes: boolean;
    tabStageHistory: boolean; tabFiles: boolean;
    changeStage: boolean; markLost: boolean; edit: boolean;
    logFollowUp: boolean; note: boolean; uploadFile: boolean; assign: boolean;
  };
  nowMs: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [losing, setLosing] = React.useState<Step | null>(null);
  const [assigning, setAssigning] = React.useState(false);
  const [moving, setMoving] = React.useState<string | null>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);

  /** The design moves a lead by clicking a stage; a Lost stage asks for its reason. */
  async function moveTo(step: Step) {
    if (!can.changeStage && !(step.kind === "LOST" && can.markLost)) return;
    if (step.kind === "LOST") { setLosing(step); return; }
    setMoving(step.id);
    const res = await changeLeadStageAction(lead.id, step.id);
    setMoving(null);
    if (!res.ok) { setError(res.error); return; }
    toast(`${lead.name} moved to ${step.name}.`);
    router.refresh();
  }

  function setParam(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) q.delete(k); else q.set(k, v);
    }
    router.push(`${pathname}?${q.toString()}`);
  }

  const TABS = [
    { key: "timeline", label: "Timeline", show: can.tabTimeline },
    { key: "followups", label: "Follow-ups", show: can.tabFollowUps },
    { key: "notes", label: "Notes", show: can.tabNotes },
    { key: "stage", label: "Stage History", show: can.tabStageHistory },
    { key: "files", label: "Files", show: can.tabFiles },
  ].filter((t) => t.show);

  const active = TABS.some((t) => t.key === tab) ? tab : (TABS[0]?.key ?? "timeline");
  const nextFu = lead.nextActionAt ? new Date(lead.nextActionAt) : null;
  const overdue = nextFu ? nextFu.getTime() < nowMs : false;

  // The design's details list, in its order and its words.
  const fields: Array<[string, React.ReactNode]> = [
    ["Name", lead.name],
    ["Mobile number", <PhoneLink key="phone" phone={lead.phone} visible={lead.canCall} />],
    ["Email", lead.email || "—"],
    ["Companies", lead.companies.join(", ") || "—"],
    ["Location", lead.location || "—"],
    ["Tele-caller", lead.ownerName ?? "Unassigned"],
    ["Notes", lead.requirement || "—"],
    ["Captured", formatDate(lead.createdAt)],
    ...lead.customFields.map((f) => [f.label, f.value] as [string, string]),
  ];

  return (
    <div className="animate-fade-up">
      {/* ------------------------------- Header ------------------------------- */}
      <div className="mb-3.5 flex flex-wrap items-start gap-3">
        <Link
          href="/sales/leads"
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line-400 bg-white px-3.5 text-[12px] font-bold text-muted-600 transition-colors hover:bg-surface-hover hover:text-navy-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to leads
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[19px] font-bold tracking-[-.01em] text-navy-950">{lead.name}</span>
            <span className="num text-[13px] font-semibold text-brand-700">
              <PhoneLink phone={lead.phone} visible={lead.canCall} />
            </span>
            <span className="num rounded-full bg-brand-100 px-[10px] py-[5px] text-[10px] font-bold text-brand-700">
              {lead.leadNo}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] font-medium text-muted-600">
            {[lead.companies.join(", "), lead.location].filter(Boolean).join(" · ") || "No company tagged"} · current stage:{" "}
            <span className="font-bold text-navy-900">{lead.stageName}</span>
          </p>
        </div>

        {onboarding}

        {can.assign && (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            className="cursor-pointer rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-600 transition-colors hover:border-brand-500 hover:text-brand-700"
          >
            {lead.ownerName ? `Reassign · ${lead.ownerName}` : "Assign"}
          </button>
        )}

        {can.edit && edit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cursor-pointer rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
          >
            ✎ Edit
          </button>
        )}
      </div>

      {editing && edit && (
        <EditLeadModal
          lead={edit.lead}
          companies={edit.companies}
          onClose={() => setEditing(false)}
          onSaved={(m) => { setEditing(false); toast(m); router.refresh(); }}
        />
      )}

      {/* ------------------------------ Stepper ------------------------------- */}
      <div className="mb-3.5 flex items-center overflow-x-auto rounded-[13px] border border-line-400 bg-white px-4 py-3">
        {stepper.map((s, i) => {
          const allowed = s.kind === "LOST" ? can.markLost : can.changeStage;
          return (
            <React.Fragment key={s.id}>
              {s.hasLine && <span className="mx-1.5 h-[2px] min-w-[18px] flex-1 bg-line-400" />}
              <button
                type="button"
                disabled={!allowed || s.current || moving !== null}
                onClick={() => moveTo(s)}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-[7px] pl-2 pr-3.5 text-[12.5px] transition-opacity",
                  allowed && !s.current ? "cursor-pointer hover:opacity-85" : "cursor-default",
                  s.current
                    ? cn("font-bold text-white", s.kind === "LOST" ? "bg-bad-600" : "bg-navy-950")
                    : s.done
                      ? "font-semibold text-good-700"
                      : "font-semibold text-muted-600",
                )}
              >
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold",
                    s.done
                      ? "bg-good-050 text-good-700"
                      : s.current
                        ? "bg-white/25 text-white"
                        : "bg-slate-050 text-muted-500",
                  )}
                >
                  {s.done ? "✓" : String(i + 1)}
                </span>
                {s.name}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {assigning && (
        <AssignModal
          leadId={lead.id}
          leadName={lead.name}
          ownerId={lead.ownerId}
          owners={owners}
          onClose={() => setAssigning(false)}
          onSaved={(m) => { setAssigning(false); toast(m); router.refresh(); }}
        />
      )}

      {losing && (
        <LostModal
          leadId={lead.id}
          leadName={lead.name}
          stage={losing}
          reasons={lostReasons}
          onClose={() => setLosing(null)}
          onSaved={(m: string) => { setLosing(null); toast(m); router.refresh(); }}
        />
      )}

      <div className="flex flex-wrap items-start gap-3.5">
        {/* ------------------------------ Left rail ----------------------------- */}
        <div className="min-w-[230px] flex-[0_1_290px] space-y-3.5">
          {nextFu && (
            <Card className="px-4 py-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Next follow-up</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-navy-950">{formatDate(lead.nextActionAt!)}</p>
                  <p className="text-[11.5px] font-medium text-muted-600">
                    {new Date(lead.nextActionAt!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Badge tone={overdue ? "bad" : "good"}>{overdue ? "Overdue" : "Scheduled"}</Badge>
              </div>
            </Card>
          )}

          <Card className="px-4 py-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Details</p>
            <dl className="mt-2">
              {fields.map(([k, v]) => (
                <div key={k} className="border-b border-line-100 py-[7px] last:border-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">{k}</dt>
                  <dd className="mt-0.5 text-[12.5px] font-semibold text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {lead.stageKind === "LOST" && (
            <div className="rounded-[13px] border border-bad-100 bg-bad-050 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-bad-700">{lead.stageName}</p>
              <p className="mt-[5px] text-[13px] font-semibold text-bad-700">{lead.lostReason ?? "No reason recorded"}</p>
              <p className="mt-[3px] text-[12px] font-medium text-bad-700/80">{lead.lostNotes || "—"}</p>
            </div>
          )}

          {lead.stageKind === "ONBOARDING" && (
            <div className="rounded-[13px] border border-good-050 bg-good-050 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-good-700">{lead.stageName}</p>
              <p className="mt-[5px] text-[12px] font-medium text-good-700">
                This lead is ready to be onboarded as a rider — fill the onboarding form from Riders &amp; Staff.
              </p>
            </div>
          )}
        </div>

        {/* -------------------------------- Tabs -------------------------------- */}
        <Card className="min-w-[300px] flex-[1_1_420px] overflow-hidden">
          <div className="flex gap-[18px] overflow-x-auto border-b border-line-200 px-[18px]">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setParam({ tab: t.key })}
                className={cn(
                  "-mb-px shrink-0 cursor-pointer whitespace-nowrap border-b-[2.5px] px-0.5 py-3 text-[12.5px] transition-colors",
                  active === t.key
                    ? "border-brand-500 font-bold text-navy-950"
                    : "border-transparent font-semibold text-muted-600 hover:text-navy-950",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-4">
            {active === "timeline" && <Timeline rows={timeline} />}
            {active === "followups" && (
              <FollowUps
                rows={followUps}
                leadId={lead.id}
                canLog={can.logFollowUp}
                onDone={(m) => { toast(m); router.refresh(); }}
                onError={setError}
              />
            )}
            {active === "notes" && (
              <Notes
                rows={notes}
                leadId={lead.id}
                canAdd={can.note}
                onDone={(m) => { toast(m); router.refresh(); }}
                onError={setError}
              />
            )}
            {active === "stage" && <StageHistory rows={stageHistory} />}
            {active === "files" && <Files rows={files} canUpload={can.uploadFile} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------ Empty state ------------------------------- */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-10 text-center text-[12px] font-medium text-muted-500">{children}</p>
  );
}

/* -------------------------------- Timeline -------------------------------- */

function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (!rows.length) return <Empty>Nothing has happened on this lead yet.</Empty>;
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-2.5">
          <span className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-extrabold text-brand-700">
            {r.action === "CREATE" ? "+" : r.action === "DELETE" ? "×" : "•"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-navy-900">{r.text}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-500">
              {r.by} · {formatDate(r.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------- Follow-ups ------------------------------- */

/**
 * The SOW's follow-up log: date, stage, remarks and the next follow-up date.
 * The stage is stamped by the action from where the lead stands.
 */
function FollowUps({
  rows, leadId, canLog, onDone, onError,
}: {
  rows: FollowUpRow[]; leadId: string; canLog: boolean;
  onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [channel, setChannel] = React.useState<string>("CALL");
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function log() {
    setBusy(true);
    const nextAt = date ? `${date}T${time || "09:00"}` : "";
    const res = await logFollowUpAction(leadId, channel, notes, outcome, nextAt);
    setBusy(false);
    if (!res.ok) { onError(res.error); return; }
    setNotes(""); setOutcome(""); setDate(""); setTime("");
    onDone("Follow-up logged.");
  }

  return (
    <div>
      {canLog && (
        <div className="mb-4 rounded-[11px] border border-line-400 bg-surface-sunken px-3.5 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Log a follow-up</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "rounded-[8px] border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  channel === c
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-muted-600 hover:bg-surface-hover",
                )}
              >
                {CHANNEL_ICON[c]} {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="mt-3 grid items-end gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <Field label="Remarks" required className="[grid-column:1/-1]">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What was discussed" />
            </Field>
            <Field label="Outcome">
              <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Interested / Call back / Not reachable" />
            </Field>
            <Field label="Next follow-up date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Button size="md" onClick={log} loading={busy} disabled={!notes.trim()}>+ Log</Button>
          </div>
        </div>
      )}

      {!rows.length ? (
        <Empty>No follow-ups logged yet.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((f) => (
            <li key={f.id} className="flex gap-2.5 rounded-[11px] border border-line-300 px-3.5 py-3">
              <span className="mt-0.5 text-[14px]">{CHANNEL_ICON[f.channel] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-bold text-navy-950">
                    {CHANNEL_LABEL[f.channel] ?? f.channel}
                  </span>
                  {f.stage && <Badge tone="muted">{f.stage}</Badge>}
                  {f.outcome && <Badge tone="slate">{f.outcome}</Badge>}
                </div>
                <p className="mt-0.5 text-[11.5px] font-medium text-muted-600">{f.notes}</p>
                {f.nextActionAt && (
                  <p className="mt-0.5 text-[11px] font-semibold text-brand-700">
                    Next: {formatDate(f.nextActionAt)}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-bold text-navy-900">{f.by}</p>
                <p className="text-[10.5px] font-medium text-muted-500">{formatDate(f.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------- Notes --------------------------------- */

function Notes({
  rows, leadId, canAdd, onDone, onError,
}: {
  rows: NoteRow[]; leadId: string; canAdd: boolean;
  onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    setBusy(true);
    const res = await addLeadNoteAction(leadId, body);
    setBusy(false);
    if (!res.ok) { onError(res.error); return; }
    setBody("");
    onDone("Note added.");
  }

  return (
    <div>
      {canAdd && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[180px] flex-1"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
          />
          <Button size="md" onClick={add} loading={busy} disabled={!body.trim()}>+ Add note</Button>
        </div>
      )}
      {!rows.length ? (
        <Empty>No notes yet.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((n) => (
            <li key={n.id} className="flex gap-2.5">
              <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-navy-950 text-[10px] font-extrabold text-brand-300">
                {n.by.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 rounded-[11px] border border-line-300 px-3.5 py-2.5">
                <p className="text-[12.5px] font-semibold text-navy-900">{n.body}</p>
                <p className="mt-0.5 text-[11px] font-medium text-muted-500">{n.by} · {formatDate(n.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Stage history ----------------------------- */

function StageHistory({ rows }: { rows: StageRow[] }) {
  if (!rows.length) return <Empty>The lead has not moved stage yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr>
            {["From", "To", "Changed by", "Date & time"].map((h) => (
              <th key={h} className="border-b border-line-300 px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-200 last:border-0">
              <td className="px-3 py-2.5 text-[12px] font-medium text-muted-600">{r.from}</td>
              <td className="px-3 py-2.5 text-[12px] font-bold text-navy-950">{r.to}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid h-[20px] w-[20px] place-items-center rounded-full bg-surface-field text-[9px] font-extrabold text-navy-600">
                    {r.by.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="text-[12px] font-semibold text-navy-900">{r.by}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-[11.5px] font-medium text-muted-500">{formatDate(r.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------- Files --------------------------------- */

function Files({ rows, canUpload }: { rows: FileRow[]; canUpload: boolean }) {
  if (!rows.length) {
    return (
      <div className="px-2 py-10 text-center">
        <p className="text-[12.5px] font-semibold text-navy-900">
          No files yet — documents collected before onboarding live here
        </p>
        {canUpload && (
          <Button size="md" variant="secondary" className="mt-3" disabled title="KYC documents are attached on the rider's onboarding form">
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload file
          </Button>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 rounded-[11px] border border-line-300 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold text-navy-950">{f.title}</p>
            <p className="text-[11px] font-medium text-muted-500">{f.fileName} · {Math.round(f.fileSize / 1024)} KB</p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-muted-500">{formatDate(f.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Lost ----------------------------------- */

/** The design asks for a reason before a lead may sit on a Lost stage. */
function LostModal({
  leadId, leadName, stage, reasons, onClose, onSaved,
}: {
  leadId: string;
  leadName: string;
  stage: Step;
  reasons: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [reasonId, setReasonId] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await changeLeadStageAction(leadId, stage.id, reasonId, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(`${leadName} marked ${stage.name.toLowerCase()}.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${leadName} as ${stage.name}`}
      description="A reason is mandatory, and stays on the lead's stage history."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={save} disabled={!reasonId}>Mark lost</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Reason" required>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">Pick a reason…</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Remarks">
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything worth recording" />
        </Field>
      </div>
    </Modal>
  );
}
