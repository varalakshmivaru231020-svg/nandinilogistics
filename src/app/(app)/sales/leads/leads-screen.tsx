"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, PhoneCall, Plus, Upload, UserCheck } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ImportDialog } from "@/components/import/import-dialog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, money, maskPhone } from "@/lib/utils";
import { LEAD_IMPORT_COLUMNS } from "@/lib/sales/lead-import";
import {
  assignLeadAction, changeLeadStageAction, createLeadAction, importLeadsAction, logFollowUpAction,
  previewLeadImportAction,
} from "./actions";

const STAGES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST",
] as const;
type Stage = (typeof STAGES)[number];

/** Board columns exclude LOST — the design keeps the pipeline to live stages. */
const BOARD_STAGES: Stage[] = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED",
];

const STAGE_LABEL: Record<string, string> = {
  // The design's own stage names. It keeps one "Site Visit" column; this
  // splits scheduled from done, which the site-visit module needs, so the two
  // are named as stages of the same thing rather than as separate ideas.
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site Visit · planned",
  VISIT_DONE: "Site Visit · done", NEGOTIATION: "Negotiation", BOOKED: "Booked", LOST: "Lost",
};

const STAGE_TONE: Record<string, "muted" | "brand" | "warn" | "navy" | "good" | "bad"> = {
  NEW: "muted", CONTACTED: "brand", SITE_VISIT_SCHEDULED: "warn",
  VISIT_DONE: "navy", NEGOTIATION: "warn", BOOKED: "good", LOST: "bad",
};

interface Lead {
  id: string; leadNo: string; name: string; phone: string; email: string | null;
  state: string; source: string; sourceId: string; ownerId: string | null; ownerName: string | null;
  projectCode: string | null; requirement: string | null;
  budgetMin: number | null; budgetMax: number | null;
  nextActionAt: string | null; lostReason: string | null;
  followUpCount: number; visitCount: number; isDuplicate: boolean;
}

type Lookup = Array<{ id: string; name: string; code?: string }>;

/** The follow-up chip the design shows on every card and row. */
function followUp(nextActionAt: string | null, nowMs: number) {
  if (!nextActionAt) return null;
  const due = new Date(nextActionAt).getTime();
  const days = Math.round((due - nowMs) / 86_400_000);
  if (days < 0) return { text: formatDate(nextActionAt), badge: `${Math.abs(days)}d overdue`, tone: "bad" as const };
  if (days === 0) return { text: formatDate(nextActionAt), badge: "today", tone: "warn" as const };
  if (days <= 7) return { text: formatDate(nextActionAt), badge: `in ${days}d`, tone: "brand" as const };
  return { text: formatDate(nextActionAt), badge: "scheduled", tone: "muted" as const };
}

export function LeadsScreen({
  leads, sources, lostReasons, projects, owners, unitTypes, can,
  query, stateFilter, sourceFilter, followUpFilter, view, nowMs,
}: {
  leads: Lead[];
  sources: Lookup;
  unitTypes: Lookup;
  lostReasons: Lookup;
  projects: Lookup;
  owners: Lookup;
  can: Record<string, boolean>;
  query: string;
  stateFilter: string;
  sourceFilter: string;
  followUpFilter: string;
  view: "board" | "list";
  nowMs: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(false);
  const [staging, setStaging] = React.useState<Lead | null>(null);
  const [followingUp, setFollowingUp] = React.useState<Lead | null>(null);
  const [assigning, setAssigning] = React.useState<Lead | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function setParam(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`?${sp.toString()}`);
  }

  /** Dropping a card onto a column moves the lead through the guarded action. */
  async function moveTo(leadId: string, stage: Stage) {
    setDragging(null);
    setDropTarget(null);
    if (stage === "LOST") {
      const lead = leads.find((l) => l.id === leadId);
      if (lead) setStaging(lead);
      return;
    }
    setError(null);
    const res = await changeLeadStageAction(leadId, stage);
    if (!res.ok) setError(res.error);
    else {
      setNotice(`Moved to ${STAGE_LABEL[stage]}.`);
      router.refresh();
    }
  }

  const byStage = new Map<string, Lead[]>();
  for (const l of leads) byStage.set(l.state, [...(byStage.get(l.state) ?? []), l]);

  const filtersActive =
    Boolean(query) || stateFilter !== "all" || sourceFilter !== "all" || followUpFilter !== "all";

  return (
    <div className="animate-fade-up">
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {notice && !error && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

      {/* Header line, as in the design */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-600">
          {leads.length} lead{leads.length === 1 ? "" : "s"} in view
          {view === "board" && " · drag a card to move it · click to open"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([["board", "▦ Grid"], ["list", "☰ List"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setParam({ view: v === "board" ? undefined : v })}
                className={cn(
                  "rounded-[9px] border px-3.5 py-2 text-[12px] font-bold transition-colors",
                  view === v
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-muted-600 hover:border-brand-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {can.import && (
            <Button variant="ghost" size="md" onClick={() => setImporting(true)}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          )}
          {can.export && (
            <ExportMenu
              size="md"
              href={(format) => exportHref("/api/sales/leads/export", format, params)}
              disabled={leads.length === 0}
            />
          )}
          {can.create && (
            <Button size="md" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              New lead
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-3">
        <Input
          defaultValue={query}
          placeholder="Search name, mobile, requirement…"
          className="w-[250px] bg-white"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <span className="text-[11px] font-semibold text-muted-400">Stage</span>
        <Select value={stateFilter} onChange={(e) => setParam({ state: e.target.value })} className="w-auto min-w-[140px] bg-white">
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Source</span>
        <Select value={sourceFilter} onChange={(e) => setParam({ source: e.target.value })} className="w-auto min-w-[140px] bg-white">
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Follow-up</span>
        <Select value={followUpFilter} onChange={(e) => setParam({ fu: e.target.value })} className="w-auto min-w-[140px] bg-white">
          <option value="all">Any</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Next 7 days</option>
          <option value="none">Not set</option>
        </Select>
        <div className="flex-1" />
        <span className="text-[11.5px] font-semibold text-muted-600">{leads.length} shown</span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setParam({ q: undefined, state: undefined, source: undefined, fu: undefined })}
            className="rounded-[8px] border border-bad-050 bg-bad-050 px-3 py-1.5 text-[11.5px] font-semibold text-bad-600 hover:brightness-95"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ------------------------------- Board -------------------------------- */}
      {view === "board" && (
        <div className="scroll-thin flex items-start gap-3 overflow-x-auto pb-2">
          {BOARD_STAGES.map((stage) => {
            const cards = byStage.get(stage) ?? [];
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  if (!can.changeStage) return;
                  e.preventDefault();
                  setDropTarget(stage);
                }}
                onDragLeave={() => setDropTarget((t) => (t === stage ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && can.changeStage) moveTo(dragging, stage);
                }}
                className={cn(
                  "min-w-[210px] flex-1 rounded-[13px] p-2.5 transition-colors",
                  dropTarget === stage ? "bg-brand-100 ring-2 ring-brand-500" : "bg-line-200",
                )}
              >
                <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                  <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-navy-600">
                    {STAGE_LABEL[stage]}
                  </span>
                  <span className="num rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-navy-600">
                    {cards.length}
                  </span>
                </div>

                <div className="flex min-h-[60px] flex-col gap-2">
                  {cards.map((c) => {
                    const fu = followUp(c.nextActionAt, nowMs);
                    return (
                      <div
                        key={c.id}
                        draggable={can.changeStage}
                        onDragStart={() => setDragging(c.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => router.push(`/sales/leads/${c.id}`)}
                        className={cn(
                          "rounded-[11px] border border-line-400 bg-white px-3 py-3 transition-shadow",
                          can.changeStage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          dragging === c.id && "opacity-40",
                          "hover:shadow-[0_6px_18px_rgba(25,26,92,.08)]",
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-1.5">
                          <span className="truncate text-[12.5px] font-bold text-navy-950">{c.name}</span>
                          <span className="shrink-0 rounded-full bg-surface-field px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[.04em] text-muted-600">
                            {c.source}
                          </span>
                        </div>
                        {c.requirement && (
                          <p className="line-clamp-2 text-[11.5px] font-medium text-navy-500">{c.requirement}</p>
                        )}
                        <div className="mt-1.5 text-[11.5px] font-semibold text-brand-700">
                          📞 {can.viewContact ? c.phone : maskPhone(c.phone)}
                        </div>
                        {fu && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line-100 pt-2">
                            <Badge tone={fu.tone}>{fu.badge}</Badge>
                            <span className="text-[10.5px] font-medium text-muted-400">{fu.text}</span>
                          </div>
                        )}
                        {c.isDuplicate && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-warn-700">
                            <Copy className="h-3 w-3" /> possible duplicate
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <p className="px-1.5 py-3 text-[11px] font-medium text-muted-400">Nothing here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------------------- List -------------------------------- */}
      {view === "list" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Lead", "Requirement", "Stage", "Follow-up", "Owner", ""].map((h) => (
                  <th key={h || "act"} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((r) => {
                const fu = followUp(r.nextActionAt, nowMs);
                return (
                  <tr key={r.id} className="border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/sales/leads/${r.id}`}
                          className="text-[13px] font-bold text-navy-950 transition-colors hover:text-brand-700"
                        >
                          {r.name}
                        </Link>
                        <span className="rounded-full bg-surface-field px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[.04em] text-muted-600">
                          {r.source}
                        </span>
                        {r.isDuplicate && <Copy className="h-3 w-3 text-warn-700" />}
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-brand-700">
                        📞 {can.viewContact ? r.phone : maskPhone(r.phone)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-navy-500">
                      {r.requirement ?? "—"}
                      {(r.budgetMin || r.budgetMax) && (
                        <div className="num text-[11px] text-muted-400">
                          {money(r.budgetMin ?? 0)} – {money(r.budgetMax ?? 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STAGE_TONE[r.state] ?? "muted"}>{STAGE_LABEL[r.state]}</Badge>
                      {r.lostReason && (
                        <div className="mt-1 text-[10.5px] font-medium text-muted-400">{r.lostReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {fu ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={fu.tone}>{fu.badge}</Badge>
                          <span className="text-[11px] font-medium text-muted-500">{fu.text}</span>
                        </div>
                      ) : (
                        <span className="text-[11.5px] font-medium text-muted-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[11.5px] font-medium text-muted-600">
                      {r.ownerName ?? "Unassigned"}
                      <div className="text-[10.5px] text-muted-400">
                        {r.followUpCount} FU · {r.visitCount} visit
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {can.followUp && !["BOOKED", "LOST"].includes(r.state) && (
                          <button
                            type="button"
                            onClick={() => setFollowingUp(r)}
                            className="rounded-[8px] p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-500"
                            title="Log follow-up"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(can.changeStage || can.markLost) && (
                          <Button size="xs" variant="secondary" onClick={() => setStaging(r)}>
                            Move
                          </Button>
                        )}
                        {can.assign && (
                          <button
                            type="button"
                            onClick={() => setAssigning(r)}
                            className="rounded-[8px] p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-500"
                            title="Assign"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[12.5px] font-medium text-muted-400">
                    No leads match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <NewLeadModal
          sources={sources}
          projects={projects}
          unitTypes={unitTypes}
          onClose={() => setCreating(false)}
          onSaved={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}
      {staging && (
        <StageModal
          lead={staging}
          lostReasons={lostReasons}
          canMarkLost={can.markLost}
          onClose={() => setStaging(null)}
          onSaved={(m) => { setStaging(null); setNotice(m); router.refresh(); }}
          onError={setError}
        />
      )}
      {followingUp && (
        <FollowUpModal
          lead={followingUp}
          onClose={() => setFollowingUp(null)}
          onSaved={(m) => { setFollowingUp(null); setNotice(m); router.refresh(); }}
        />
      )}
      {importing && (
        <ImportDialog
          title="Import leads"
          description="Upload a .csv or .xlsx — a portal export works as it is. Every row is checked, duplicates are flagged, and owners follow your assignment rule."
          columns={LEAD_IMPORT_COLUMNS}
          templateName="leads"
          preview={previewLeadImportAction}
          commit={importLeadsAction}
          onClose={() => setImporting(false)}
          onImported={(m) => { setImporting(false); setError(null); setNotice(m); router.refresh(); }}
        />
      )}
      {assigning && (
        <AssignModal
          lead={assigning}
          owners={owners}
          onClose={() => setAssigning(null)}
          onSaved={(m) => { setAssigning(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------- Modals ---------------------------------- */

function NewLeadModal({
  sources, projects, unitTypes, onClose, onSaved,
}: {
  sources: Lookup; projects: Lookup; unitTypes: Lookup;
  onClose: () => void; onSaved: (m: string) => void;
}) {
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
      open onClose={onClose} title="New lead"
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
          <Field label="Interested in" hint="Matched against available inventory.">
            <Select name="unitTypeId" defaultValue="">
              <option value="">Any unit type</option>
              {unitTypes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
    else onSaved(`${lead.name} moved to ${STAGE_LABEL[state]}.`);
  }

  return (
    <Modal
      open onClose={onClose} title={`Move ${lead.name}`}
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
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
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
            <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
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
      open onClose={onClose}
      title={`${lead.name} · ${lead.leadNo}`}
      description={[lead.requirement, lead.ownerName ? `owned by ${lead.ownerName}` : null]
        .filter(Boolean)
        .join(" · ")}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Close</Button>
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
      open onClose={onClose} title={`Assign ${lead.name}`} size="sm"
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
