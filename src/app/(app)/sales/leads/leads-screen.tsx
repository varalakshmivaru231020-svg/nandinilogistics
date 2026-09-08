"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, PhoneCall, Plus, Search, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { formatDate, money } from "@/lib/utils";
import { assignLeadAction, changeLeadStageAction, createLeadAction, logFollowUpAction } from "./actions";

const STAGES = ["NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_TONE: Record<string, "slate" | "brand" | "warn" | "navy" | "good" | "bad"> = {
  NEW: "slate", CONTACTED: "brand", SITE_VISIT_SCHEDULED: "warn",
  VISIT_DONE: "navy", NEGOTIATION: "warn", BOOKED: "good", LOST: "bad",
};

interface Lead {
  id: string; leadNo: string; name: string; phone: string; email: string | null;
  state: string; source: string; ownerId: string | null; ownerName: string | null;
  projectCode: string | null; requirement: string | null;
  budgetMin: number | null; budgetMax: number | null;
  nextActionAt: string | null; lostReason: string | null;
  followUpCount: number; visitCount: number; isDuplicate: boolean;
}

type Lookup = Array<{ id: string; name: string; code?: string }>;

/** Masks a phone number when the user lacks the contact FIELD permission. */
function maskPhone(phone: string) {
  return phone.length > 4 ? `${"•".repeat(phone.length - 4)}${phone.slice(-4)}` : "••••";
}

export function LeadsScreen({
  leads, sources, lostReasons, projects, owners, can, query, stateFilter,
}: {
  leads: Lead[];
  sources: Lookup;
  lostReasons: Lookup;
  projects: Lookup;
  owners: Lookup;
  can: Record<string, boolean>;
  query: string;
  stateFilter: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(false);
  const [staging, setStaging] = React.useState<Lead | null>(null);
  const [followingUp, setFollowingUp] = React.useState<Lead | null>(null);
  const [assigning, setAssigning] = React.useState<Lead | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (!value || value === "all") sp.delete(key);
    else sp.set(key, value);
    router.push(`?${sp.toString()}`);
  }

  function exportCsv() {
    const header = ["Lead No", "Name", "Phone", "Source", "Stage", "Owner", "Next action"];
    const rows = leads.map((l) => [
      l.leadNo, l.name, can.viewContact ? l.phone : maskPhone(l.phone),
      l.source, l.state, l.ownerName ?? "", l.nextActionAt ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Lead>[] = [
    {
      key: "lead",
      header: "Lead",
      render: (l) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-navy-950">{l.name}</span>
            {l.isDuplicate && (
              <span title="Possible duplicate of an existing lead">
                <Copy className="h-3 w-3 text-warn-700" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted-500">
            <code>{l.leadNo}</code> · {l.source}
            {l.projectCode && ` · ${l.projectCode}`}
          </p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (l) => (
        <div className="text-xs">
          <p className={can.viewContact ? "text-navy-600" : "text-muted-400"}>
            {can.viewContact ? l.phone : maskPhone(l.phone)}
          </p>
          {l.email && (
            <p className="text-muted-400">{can.viewContact ? l.email : "•••@•••"}</p>
          )}
        </div>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      className: "num",
      render: (l) =>
        l.budgetMin || l.budgetMax ? (
          <span className="text-xs text-muted-600">
            {money(l.budgetMin ?? 0)} – {money(l.budgetMax ?? 0)}
          </span>
        ) : (
          <span className="text-muted-400">—</span>
        ),
    },
    { key: "owner", header: "Owner", render: (l) => <span className="text-xs text-muted-600">{l.ownerName ?? "Unassigned"}</span> },
    {
      key: "next",
      header: "Next action",
      render: (l) => {
        if (!l.nextActionAt) return <span className="text-xs text-muted-400">Not set</span>;
        // Compared on the client, so "overdue" stays true to the reader's clock.
        const overdue = new Date(l.nextActionAt).getTime() < Date.now();
        return (
          <span className={overdue ? "text-xs font-medium text-bad-600" : "text-xs text-muted-600"}>
            {formatDate(l.nextActionAt)}
            {overdue && " · overdue"}
          </span>
        );
      },
    },
    {
      key: "activity",
      header: "Activity",
      align: "center",
      render: (l) => (
        <span className="num text-xs text-muted-500">
          {l.followUpCount} FU · {l.visitCount} visit
        </span>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      align: "center",
      render: (l) => (
        <div>
          <Badge tone={STAGE_TONE[l.state] ?? "slate"}>{l.state.replace(/_/g, " ")}</Badge>
          {l.lostReason && <p className="mt-0.5 text-[11px] text-muted-400">{l.lostReason}</p>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (l) => (
        <div className="flex items-center justify-end gap-0.5">
          {can.followUp && !["BOOKED", "LOST"].includes(l.state) && (
            <button type="button" onClick={() => setFollowingUp(l)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Log follow-up">
              <PhoneCall className="h-3.5 w-3.5" />
            </button>
          )}
          {(can.changeStage || can.markLost) && (
            <button type="button" onClick={() => setStaging(l)} className="rounded border border-line-400 bg-white px-2 py-1 text-xs text-muted-600 hover:bg-surface-hover">
              Move
            </button>
          )}
          {can.assign && (
            <button type="button" onClick={() => setAssigning(l)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Assign">
              <UserCheck className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input
            defaultValue={query}
            placeholder="Search name, phone or lead number…"
            className="pl-8"
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
          />
        </div>
        <Select value={stateFilter} onChange={(e) => setParam("state", e.target.value)} className="w-52">
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
        <div className="flex-1" />
        {can.export && (
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}
        {can.create && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New lead
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={leads} rowKey={(l) => l.id} dense />

      {creating && (
        <NewLeadModal
          sources={sources}
          projects={projects}
          onClose={() => setCreating(false)}
          onSaved={(msg) => { setCreating(false); setNotice(msg); router.refresh(); }}
        />
      )}

      {staging && (
        <StageModal
          lead={staging}
          lostReasons={lostReasons}
          canMarkLost={can.markLost}
          onClose={() => setStaging(null)}
          onSaved={(msg) => { setStaging(null); setNotice(msg); router.refresh(); }}
          onError={setError}
        />
      )}

      {followingUp && (
        <FollowUpModal
          lead={followingUp}
          onClose={() => setFollowingUp(null)}
          onSaved={(msg) => { setFollowingUp(null); setNotice(msg); router.refresh(); }}
        />
      )}

      {assigning && (
        <AssignModal
          lead={assigning}
          owners={owners}
          onClose={() => setAssigning(null)}
          onSaved={(msg) => { setAssigning(null); setNotice(msg); router.refresh(); }}
        />
      )}
    </div>
  );
}

function NewLeadModal({
  sources, projects, onClose, onSaved,
}: { sources: Lookup; projects: Lookup; onClose: () => void; onSaved: (m: string) => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createLeadAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(res.data.duplicate ? "Lead captured — flagged as a possible duplicate." : "Lead captured.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New lead"
      description="Duplicate detection runs on the phone number as you save."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={busy}>Capture lead</Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input name="name" required /></Field>
          <Field label="Phone" required><Input name="phone" type="tel" required /></Field>
          <Field label="Alternate phone"><Input name="altPhone" type="tel" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Source" required>
            <Select name="sourceId" required defaultValue="">
              <option value="">Select…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Project of interest">
            <Select name="projectId" defaultValue="">
              <option value="">— Not specified —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Budget from (₹)"><Input name="budgetMin" type="number" min={0} step="any" /></Field>
          <Field label="Budget to (₹)"><Input name="budgetMax" type="number" min={0} step="any" /></Field>
          <Field label="Requirement" className="sm:col-span-2">
            <Textarea name="requirement" rows={2} placeholder="2–3 BHK, east facing, ready to move" />
          </Field>
          <Field label="Next action on" className="sm:col-span-2" hint="Overdue follow-ups escalate to the sales head.">
            <Input name="nextActionAt" type="date" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function StageModal({
  lead, lostReasons, canMarkLost, onClose, onSaved, onError,
}: {
  lead: Lead; lostReasons: Lookup; canMarkLost: boolean;
  onClose: () => void; onSaved: (m: string) => void; onError: (e: string) => void;
}) {
  const [state, setState] = React.useState<Stage>(lead.state as Stage);
  const [lostReasonId, setLostReasonId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await changeLeadStageAction(lead.id, state, lostReasonId || undefined, notes);
    setBusy(false);
    if (!res.ok) { setError(res.error); onError(res.error); }
    else onSaved(`${lead.name} moved to ${state.replace(/_/g, " ")}.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move ${lead.name}`}
      description="A mandatory reason is captured when a lead is marked lost."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={state === "LOST" && !lostReasonId}>Move lead</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Stage" required>
          <Select value={state} onChange={(e) => setState(e.target.value as Stage)}>
            {STAGES.filter((s) => s !== "LOST" || canMarkLost).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>

        {state === "LOST" && (
          <>
            <Field label="Lost reason" required>
              <Select value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
                <option value="">Select a reason…</option>
                {lostReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function FollowUpModal({
  lead, onClose, onSaved,
}: { lead: Lead; onClose: () => void; onSaved: (m: string) => void }) {
  const [channel, setChannel] = React.useState("CALL");
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [nextActionAt, setNextActionAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await logFollowUpAction(lead.id, channel, notes, outcome, nextActionAt);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved("Follow-up logged.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Log a follow-up — ${lead.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!notes.trim()}>Save follow-up</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Channel" required>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["CALL", "WHATSAPP", "EMAIL", "MEETING", "SITE_VISIT"].map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
        <Field label="What happened" required>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} autoFocus />
        </Field>
        <Field label="Outcome">
          <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Interested / Call back / Not reachable" />
        </Field>
        <Field label="Next action on" hint="Leaving this blank drops the lead off the follow-up list.">
          <Input type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AssignModal({
  lead, owners, onClose, onSaved,
}: { lead: Lead; owners: Lookup; onClose: () => void; onSaved: (m: string) => void }) {
  const [ownerId, setOwnerId] = React.useState(lead.ownerId ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await assignLeadAction(lead.id, ownerId);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved("Lead reassigned.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign ${lead.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!ownerId}>Assign</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Owner" required>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Select…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
