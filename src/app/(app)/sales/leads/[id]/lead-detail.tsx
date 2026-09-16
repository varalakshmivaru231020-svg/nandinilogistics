"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Upload, X } from "lucide-react";

import { Badge, Card, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, money } from "@/lib/utils";
import { formatResponse } from "@/lib/sales/assignment";
import { addLeadNoteAction, blockUnitForLeadAction, releaseUnitForLeadAction } from "../actions";
import { logFollowUpAction } from "../actions";
import { EditLeadModal, type EditLeadValues } from "./lead-edit-modal";
import { AssignModal } from "../assign-modal";

/* --------------------------------- Types --------------------------------- */

interface Lead {
  id: string; leadNo: string; name: string; phone: string; email: string | null;
  sourceName: string; projectName: string | null; ownerName: string | null;
  firstResponseMins: number | null;
  state: string; requirement: string | null;
  budgetMin: number | null; budgetMax: number | null;
  nextActionAt: string | null; lostReason: string | null; lostNotes: string | null;
  createdAt: string;
}
interface Step { key: string; name: string; hasLine: boolean; done: boolean; current: boolean }
interface TimelineRow { id: string; text: string; by: string; at: string; action: string }
interface FollowUpRow { id: string; channel: string; notes: string; outcome: string | null; by: string; at: string; nextActionAt: string | null }
interface NoteRow { id: string; body: string; by: string; at: string }
interface StageRow { id: string; from: string; to: string; by: string; at: string }
interface FileRow { id: string; title: string; fileName: string; fileSize: number; at: string }
interface BlockedRow { id: string; kind: "hold" | "booking"; unitNumber: string; plan: string; expiresAt: string | null }
interface AvailRow { id: string; unitNumber: string; plan: string; blockName: string | null }

/** Follow-up channels, as the design's chip row. */
const CHANNELS = [
  { key: "CALL", label: "Call" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "EMAIL", label: "Email" },
  { key: "MEETING", label: "Meeting" },
  { key: "SITE_VISIT", label: "Site visit" },
];

const CHANNEL_ICON: Record<string, string> = {
  CALL: "📞", WHATSAPP: "💬", EMAIL: "✉", MEETING: "🤝", SITE_VISIT: "🏗",
};

export function LeadDetail({
  lead, stepper, timeline, followUps, notes, stageHistory, files, blocked, available,
  towers, tower, tab, projectName, edit, owners, can, nowMs,
}: {
  lead: Lead;
  /** Who the lead may be reassigned to; empty when the viewer may not reassign. */
  owners: Array<{ id: string; name: string }>;
  stepper: Step[];
  timeline: TimelineRow[];
  followUps: FollowUpRow[];
  notes: NoteRow[];
  stageHistory: StageRow[];
  files: FileRow[];
  blocked: BlockedRow[];
  available: AvailRow[];
  towers: Array<{ id: string; name: string }>;
  tower: string;
  tab: string;
  projectName: string | null;
  /** The edit form's values and lookups; null when the viewer may not edit this lead. */
  edit: {
    lead: EditLeadValues;
    sources: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; name: string }>;
    unitTypes: Array<{ id: string; name: string }>;
  } | null;
  can: Record<string, boolean>;
  nowMs: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);

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
    { key: "stage", label: "Stage history", show: can.tabStageHistory },
    { key: "files", label: "Files", show: can.tabFiles },
    { key: "flats", label: "Flats", show: can.tabFlats },
  ].filter((t) => t.show);

  const active = TABS.some((t) => t.key === tab) ? tab : (TABS[0]?.key ?? "timeline");
  const nextFu = lead.nextActionAt ? new Date(lead.nextActionAt) : null;
  const overdue = nextFu ? nextFu.getTime() < nowMs : false;

  const fields: Array<[string, string]> = [
    ["Lead no.", lead.leadNo],
    ["Source", lead.sourceName],
    ["Project", lead.projectName ?? "—"],
    ["Owner", lead.ownerName ?? "Unassigned"],
    // Measured, not assumed: from assignment to the first follow-up or stage change.
    ["First response", lead.firstResponseMins === null ? "Awaiting first response" : formatResponse(lead.firstResponseMins)],
    ["Requirement", lead.requirement || "—"],
    ["Budget", lead.budgetMin || lead.budgetMax
      ? `${money(lead.budgetMin ?? 0)} – ${money(lead.budgetMax ?? 0)}`
      : "—"],
    ["Email", lead.email || "—"],
    ["Captured", formatDate(lead.createdAt)],
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
            <span className="num text-[12.5px] font-semibold text-muted-600">📞 {lead.phone}</span>
            <Badge tone="slate">{lead.sourceName}</Badge>
          </div>
          <p className="mt-0.5 text-[12px] font-medium text-muted-600">
            {lead.requirement || "No requirement captured"} · current stage:{" "}
            <span className="font-bold text-navy-900">{lead.state.replace(/_/g, " ").toLowerCase()}</span>
          </p>
        </div>

        {can.assign && owners.length > 0 && (
          <Button size="md" variant="secondary" onClick={() => setAssigning(true)}>
            Assign
          </Button>
        )}

        {can.sendMail && (
          <Button
            size="md"
            variant="ghost"
            disabled={!lead.email}
            title={lead.email ? `Mail ${lead.email}` : "No email on this lead"}
            onClick={() => { if (lead.email) window.location.href = `mailto:${lead.email}`; }}
          >
            <Mail className="mr-1.5 h-3.5 w-3.5" /> Send mail
          </Button>
        )}
        {can.edit && edit && (
          <Button size="md" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      {editing && edit && (
        <EditLeadModal
          lead={edit.lead}
          sources={edit.sources}
          projects={edit.projects}
          unitTypes={edit.unitTypes}
          onClose={() => setEditing(false)}
          onSaved={(m) => { setEditing(false); toast(m); router.refresh(); }}
        />
      )}

      {assigning && (
        <AssignModal
          leadId={lead.id}
          leadName={lead.name}
          ownerId={null}
          owners={owners}
          onClose={() => setAssigning(false)}
          onSaved={(m) => { setAssigning(false); toast(m); router.refresh(); }}
        />
      )}

      {/* ------------------------------ Stepper ------------------------------- */}
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 rounded-[13px] border border-line-400 bg-white px-4 py-3">
        {stepper.map((s) => (
          <React.Fragment key={s.key}>
            {s.hasLine && <span className={cn("h-[2px] w-6 rounded-full", s.done ? "bg-good-600" : "bg-line-400")} />}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                s.current ? "bg-brand-100 text-brand-700"
                  : s.done ? "text-good-700"
                  : "text-muted-400",
              )}
            >
              <span
                className={cn(
                  "grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-extrabold",
                  s.done ? "bg-good-600 text-white"
                    : s.current ? "bg-brand-500 text-white"
                    : "bg-surface-field text-muted-400",
                )}
              >
                {s.done ? "✓" : "•"}
              </span>
              {s.name}
            </span>
          </React.Fragment>
        ))}
        {lead.state === "LOST" && <Badge tone="bad" className="ml-1">Lost</Badge>}
      </div>

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
            <dl className="mt-2 space-y-2">
              {fields.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-[11.5px] font-medium text-muted-500">{k}</dt>
                  <dd className="min-w-0 text-right text-[12px] font-semibold text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {lead.state === "LOST" && (
            <Card className="border-bad-050 px-4 py-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-bad-600">Lost</p>
              <p className="mt-1.5 text-[12.5px] font-bold text-navy-950">{lead.lostReason ?? "No reason recorded"}</p>
              {lead.lostNotes && <p className="mt-1 text-[11.5px] font-medium text-muted-600">{lead.lostNotes}</p>}
            </Card>
          )}
        </div>

        {/* -------------------------------- Tabs -------------------------------- */}
        <Card className="min-w-[300px] flex-[1_1_420px] overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-line-300 bg-surface-sunken px-3 py-2.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setParam({ tab: t.key })}
                className={cn(
                  "rounded-[8px] px-3 py-1.5 text-[12px] font-bold transition-colors",
                  active === t.key ? "bg-brand-100 text-brand-700" : "text-muted-600 hover:bg-surface-hover hover:text-navy-900",
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
            {active === "flats" && (
              <Flats
                leadId={lead.id}
                blocked={blocked}
                available={available}
                towers={towers}
                tower={tower}
                projectName={projectName}
                can={can}
                onTower={(t) => setParam({ tower: t === "all" ? undefined : t })}
                onDone={(m) => { toast(m); router.refresh(); }}
                onError={setError}
              />
            )}
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

function FollowUps({
  rows, leadId, canLog, onDone, onError,
}: {
  rows: FollowUpRow[]; leadId: string; canLog: boolean;
  onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [channel, setChannel] = React.useState("CALL");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function schedule() {
    setBusy(true);
    const nextAt = date ? `${date}T${time || "09:00"}` : "";
    const res = await logFollowUpAction(leadId, channel, remarks || "Follow-up scheduled", "", nextAt);
    setBusy(false);
    if (!res.ok) { onError(res.error); return; }
    setRemarks(""); setDate(""); setTime("");
    onDone("Follow-up scheduled.");
  }

  return (
    <div>
      {canLog && (
        <div className="mb-4 rounded-[11px] border border-line-400 bg-surface-sunken px-3.5 py-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Follow-up type</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setChannel(c.key)}
                className={cn(
                  "rounded-[8px] border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  channel === c.key
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-muted-600 hover:bg-surface-hover",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid items-end gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time" required>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. discuss parking & payment plan"
              />
            </Field>
            <Button size="md" onClick={schedule} loading={busy} disabled={!date}>+ Schedule</Button>
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
                    {CHANNELS.find((c) => c.key === f.channel)?.label ?? f.channel}
                  </span>
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
              <td className="px-3 py-2.5 text-[12px] font-medium capitalize text-muted-600">{r.from.toLowerCase()}</td>
              <td className="px-3 py-2.5 text-[12px] font-bold capitalize text-navy-950">{r.to.toLowerCase()}</td>
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
          No files yet — KYC documents and brochures live here
        </p>
        {canUpload && (
          <Button size="md" variant="secondary" className="mt-3" disabled title="Attach from the customer record once the lead is booked">
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

/* ---------------------------------- Flats --------------------------------- */

function Flats({
  leadId, blocked, available, towers, tower, projectName, can, onTower, onDone, onError,
}: {
  leadId: string;
  blocked: BlockedRow[];
  available: AvailRow[];
  towers: Array<{ id: string; name: string }>;
  tower: string;
  projectName: string | null;
  can: Record<string, boolean>;
  onTower: (t: string) => void;
  onDone: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function block(unitId: string) {
    setBusy(unitId);
    const res = await blockUnitForLeadAction(leadId, unitId);
    setBusy(null);
    if (!res.ok) { onError(res.error); return; }
    onDone("Unit blocked — the Available Flats board is updated.");
  }

  async function release(holdId: string) {
    setBusy(holdId);
    const res = await releaseUnitForLeadAction(leadId, holdId);
    setBusy(null);
    if (!res.ok) { onError(res.error); return; }
    onDone("Hold released.");
  }

  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Booked for this lead</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {blocked.length === 0 ? (
          <span className="text-[11.5px] font-medium text-muted-500">
            None yet — pick from the available units below · multiple units can be booked
          </span>
        ) : (
          blocked.map((b) => (
            <span
              key={b.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold",
                b.kind === "booking" ? "bg-navy-950 text-brand-300" : "bg-warn-050 text-warn-700",
              )}
            >
              {b.unitNumber} · {b.plan}
              {b.kind === "hold" && can.release && (
                <button
                  type="button"
                  onClick={() => release(b.id)}
                  disabled={busy === b.id}
                  title="Release hold"
                  className="grid h-[16px] w-[16px] place-items-center rounded-full bg-white/70 text-[9px] text-warn-700 transition-opacity hover:opacity-70 disabled:opacity-40"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {can.block && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">
              Available units{projectName ? ` · ${projectName}` : ""}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: "all", name: "All" }, ...towers].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTower(t.id)}
                  className={cn(
                    "rounded-[7px] border px-2.5 py-1 text-[11px] font-bold transition-colors",
                    tower === t.id
                      ? "border-brand-500 bg-brand-100 text-brand-700"
                      : "border-line-400 bg-white text-muted-600 hover:bg-surface-hover",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {available.length === 0 ? (
              <span className="text-[11.5px] font-medium text-muted-500">No available units in this selection.</span>
            ) : (
              available.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => block(u.id)}
                  disabled={busy === u.id}
                  className="rounded-[8px] border border-good-050 bg-good-050 px-3 py-1.5 text-[11.5px] font-bold text-good-700 transition-colors hover:brightness-95 disabled:opacity-50"
                >
                  {u.unitNumber} · {u.plan}
                </button>
              ))
            )}
          </div>

          <p className="mt-3 text-[11px] font-medium text-muted-500">
            Booking or releasing here updates the Available Flats board instantly.
          </p>
        </>
      )}
    </div>
  );
}
