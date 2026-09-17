"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ImportDialog } from "@/components/import/import-dialog";
import { ListNote } from "@/components/list/list-note";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, money, maskPhone, phone } from "@/lib/utils";
import { LEAD_IMPORT_COLUMNS } from "@/lib/sales/lead-import";
import {
  changeLeadStageAction, createLeadAction, importLeadsAction, logFollowUpAction,
  previewLeadImportAction,
} from "./actions";

const STAGES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST",
] as const;
type Stage = (typeof STAGES)[number];

/** Board columns exclude LOST — the design keeps the pipeline to live stages. */
/**
 * The design's six columns. Site Visit is one column holding both the planned
 * and the done stage; dropping a card there schedules the visit.
 */
const BOARD_COLUMNS: Array<{ key: string; label: string; stages: Stage[]; drop: Stage }> = [
  { key: "new", label: "New", stages: ["NEW"], drop: "NEW" },
  { key: "contacted", label: "Contacted", stages: ["CONTACTED"], drop: "CONTACTED" },
  { key: "visit", label: "Site Visit", stages: ["SITE_VISIT_SCHEDULED", "VISIT_DONE"], drop: "SITE_VISIT_SCHEDULED" },
  { key: "nego", label: "Negotiation", stages: ["NEGOTIATION"], drop: "NEGOTIATION" },
  { key: "booked", label: "Booked", stages: ["BOOKED"], drop: "BOOKED" },
  { key: "lost", label: "Lost", stages: ["LOST"], drop: "LOST" },
];

const STAGE_LABEL: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site Visit",
  VISIT_DONE: "Site Visit", NEGOTIATION: "Negotiation", BOOKED: "Booked", LOST: "Lost",
};

const STAGE_TONE: Record<string, "muted" | "brand" | "warn" | "navy" | "good" | "bad"> = {
  NEW: "muted", CONTACTED: "brand", SITE_VISIT_SCHEDULED: "warn",
  VISIT_DONE: "navy", NEGOTIATION: "warn", BOOKED: "good", LOST: "bad",
};

interface Lead {
  id: string; leadNo: string; name: string; phone: string; email: string | null;
  state: string; source: string; sourceId: string; ownerId: string | null; ownerName: string | null;
  projectName: string | null; requirement: string | null;
  budgetMin: number | null; budgetMax: number | null;
  nextActionAt: string | null; lostReason: string | null;
  followUpCount: number; visitCount: number; isDuplicate: boolean;
}

type Lookup = Array<{ id: string; name: string; code?: string }>;

/**
 * The country codes the design's capture form offers, in its order. The number
 * is stored with the code in front of it, which is how every screen reads it
 * back and how duplicate detection strips it again.
 */
const COUNTRY_CODES = [
  "+91 India", "+971 UAE", "+966 Saudi Arabia", "+974 Qatar", "+965 Kuwait", "+973 Bahrain",
  "+968 Oman", "+65 Singapore", "+60 Malaysia", "+1 USA / Canada", "+44 UK", "+61 Australia",
  "+64 New Zealand", "+49 Germany", "+33 France", "+81 Japan", "+86 China", "+94 Sri Lanka",
  "+977 Nepal", "+880 Bangladesh",
];

/** What the design puts in an empty box, by the kind of thing it asks for. */
const PLACEHOLDER: Record<string, string> = {
  PHONE: "98765 43210 (without country code)",
  NUMBER: "e.g. 85,00,000",
  DATE: "dd-mm-yyyy",
};
const placeholderFor = (type: string) => PLACEHOLDER[type] ?? "Type here";

/** A row of Masters → Lead Settings: what the capture form asks, and how. */
export interface LeadField {
  id: string; fieldKey: string; label: string; type: string; required: boolean; isSystem: boolean;
}

/**
 * The design's follow-up block: OVERDUE, TODAY or UPCOMING, each with its own
 * tint and a left border in its colour.
 */
const FU_BLOCK: Record<string, string> = {
  bad: "border-bad-100 border-l-bad-700 bg-bad-050 text-bad-700",
  warn: "border-amber-200 border-l-warn-700 bg-warn-050 text-warn-700",
  brand: "border-brand-200 border-l-brand-700 bg-brand-100 text-brand-700",
};

/**
 * The design colours a source chip by which source it is, and leaves anything
 * it does not know in slate.
 */
const SOURCE_TONE: Record<string, string> = {
  website: "bg-brand-100 text-brand-700",
  magicbricks: "bg-warn-050 text-warn-700",
  "99acres": "bg-plum-050 text-plum-600",
  "walk-in": "bg-good-050 text-good-700",
  referral: "bg-bad-050 text-bad-700",
};

const sourceTone = (name: string) => SOURCE_TONE[name.trim().toLowerCase()] ?? "bg-slate-050 text-slate-600";

function followUp(nextActionAt: string | null, nowMs: number, state?: string) {
  if (!nextActionAt) return null;
  const due = new Date(nextActionAt);
  const days = Math.round((due.getTime() - nowMs) / 86_400_000);
  // The design writes the date in figures: 08/09/2026 · 11:00.
  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const when = `${dd}/${mm}/${due.getFullYear()} · ${due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const visit = state === "SITE_VISIT_SCHEDULED";
  const base = { text: when, icon: visit ? "🏠" : "📞", kind: visit ? "SITE VISIT" : "CALL" };
  if (days < 0) return { ...base, badge: "overdue", tone: "bad" as const };
  if (days === 0) return { ...base, badge: "today", tone: "warn" as const };
  return { ...base, badge: "upcoming", tone: "brand" as const };
}

export function LeadsScreen({
  leads, sources, lostReasons, projects, unitTypes, formFields, can,
  query, stateFilter, sourceFilter, followUpFilter, view, nowMs,
  totalLeads, openLeads,
}: {
  formFields: LeadField[];
  leads: Lead[];
  /** Every lead in the actor's scope, and those still open — for the header. */
  totalLeads: number;
  openLeads: number;
  sources: Lookup;
  unitTypes: Lookup;
  lostReasons: Lookup;
  projects: Lookup;
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
          {openLeads} open lead{openLeads === 1 ? "" : "s"} · drag a card to move it · click to open
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([["board", "▦ Grid"], ["list", "☰ List"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setParam({ view: v === "board" ? undefined : v })}
                className={cn(
                  "rounded-[8px] border px-[13px] py-2 text-[12px] font-bold transition-colors",
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
            <Button variant="secondary" size="md" onClick={() => setImporting(true)}>
              ↓ Import
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
              + Capture lead
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-3">
        <Input
          defaultValue={query}
          placeholder="Search name, mobile, requirement…"
          className="w-[250px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <span className="text-[11px] font-semibold text-muted-400">Stage</span>
        <Select value={stateFilter} onChange={(e) => setParam({ state: e.target.value })} className="w-auto min-w-[140px]">
          <option value="all">All</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Source</span>
        <Select value={sourceFilter} onChange={(e) => setParam({ source: e.target.value })} className="w-auto min-w-[140px]">
          <option value="all">All</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Follow-up</span>
        <Select value={followUpFilter} onChange={(e) => setParam({ fu: e.target.value })} className="w-auto min-w-[140px]">
          <option value="all">All</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Next 7 days</option>
          <option value="none">Not set</option>
        </Select>
        <div className="flex-1" />
        <span className="text-[11.5px] font-semibold text-muted-600">
          {leads.length} of {totalLeads} leads shown
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setParam({ q: undefined, state: undefined, source: undefined, fu: undefined })}
            className="rounded-[8px] border border-bad-100 bg-bad-050 px-3 py-[7px] text-[11.5px] font-semibold text-bad-700 hover:brightness-95"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ------------------------------- Board -------------------------------- */}
      {view === "board" && (
        <div className="scroll-thin flex items-start gap-3 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((col) => {
            const cards = col.stages.flatMap((st) => byStage.get(st) ?? []);
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  if (!can.changeStage) return;
                  e.preventDefault();
                  setDropTarget(col.key);
                }}
                onDragLeave={() => setDropTarget((t) => (t === col.key ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && can.changeStage) moveTo(dragging, col.drop);
                }}
                className={cn(
                  "min-w-[190px] flex-1 rounded-[13px] p-2.5 transition-colors",
                  dropTarget === col.key ? "bg-brand-100 ring-2 ring-brand-500" : "bg-line-200",
                )}
              >
                <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                  <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-navy-600">
                    {col.label}
                  </span>
                  <span
                    className={cn(
                      "num rounded-full px-2.5 py-[3px] text-[10.5px] font-bold text-white",
                      col.key === "booked" ? "bg-good-600" : col.key === "lost" ? "bg-bad-700" : "bg-navy-950",
                    )}
                  >
                    {cards.length}
                  </span>
                </div>

                <div className="flex min-h-[60px] flex-col gap-2">
                  {cards.slice(0, 6).map((c) => {
                    const fu = followUp(c.nextActionAt, nowMs, c.state);
                    return (
                      <div
                        key={c.id}
                        draggable={can.changeStage}
                        onDragStart={() => setDragging(c.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => router.push(`/sales/leads/${c.id}`)}
                        className={cn(
                          "rounded-[11px] border border-line-400 bg-white px-[13px] py-3 transition-shadow",
                          can.changeStage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          dragging === c.id && "opacity-40",
                          "hover:border-brand-150 hover:shadow-[0_6px_18px_rgba(25,26,92,.1)]",
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-1.5">
                          <span className="text-[12.5px] font-bold text-navy-950">{c.name}</span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[.04em]", sourceTone(c.source))}>
                            {c.source}
                          </span>
                        </div>
                        <p className="text-[11.5px] font-medium text-navy-500">
                          {[c.projectName, c.requirement].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <div className="mt-[7px] text-[11.5px] font-semibold text-brand-700">
                          📞 {can.viewContact ? phone(c.phone) : maskPhone(c.phone)}
                        </div>

                        {fu ? (
                          <div className={cn("mt-2 flex flex-col gap-1 rounded-[8px] border border-l-[3px] px-[9px] py-[7px]", FU_BLOCK[fu.tone])}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[12px]">{fu.icon}</span>
                              <span className="text-[10px] font-extrabold tracking-[.06em]">{fu.kind}</span>
                              <span className="rounded-full bg-current px-[7px] py-[3px] text-[8.5px] font-extrabold tracking-[.06em]">
                                <span className="text-white">{fu.badge.toUpperCase()}</span>
                              </span>
                            </div>
                            <span className="text-[10.5px] font-semibold opacity-85">{fu.text}</span>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-[8px] border border-dashed border-amber-200 bg-warn-050 px-[9px] py-1.5 text-[10.5px] font-semibold text-warn-700">
                            No follow-up set
                          </div>
                        )}

                        {col.key === "lost" && c.lostReason && (
                          <div className="mt-[7px] rounded-[7px] bg-bad-050 px-2 py-[5px] text-[10.5px] font-semibold text-bad-700">
                            {c.lostReason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length > 6 && (
                    <div className="rounded-[8px] border border-brand-200 bg-brand-100 py-2 text-center text-[11px] font-bold text-brand-700">
                      + {cards.length - 6} more · switch to List view
                    </div>
                  )}
                  {cards.length === 0 && (
                    <p className="px-1.5 py-3 text-[11px] font-medium text-muted-400">Nothing here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Lead", "Requirement", "Stage", "Next follow-up"].map((h) => (
                  <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((r) => {
                const fu = followUp(r.nextActionAt, nowMs, r.state);
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/sales/leads/${r.id}`)}
                    className="cursor-pointer border-b border-line-150 last:border-0 hover:bg-surface-tint"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-navy-950">{r.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-[.04em]", sourceTone(r.source))}>
                          {r.source}
                        </span>
                        {r.isDuplicate && <Copy className="h-3 w-3 text-warn-700" />}
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-brand-700">
                        📞 {can.viewContact ? phone(r.phone) : maskPhone(r.phone)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-navy-500">
                      {r.requirement ?? "—"}
                      {(r.budgetMin || r.budgetMax) && (
                        <div className="num text-[11px] text-muted-400">
                          {r.budgetMin && r.budgetMax
                            ? `${money(r.budgetMin)} – ${money(r.budgetMax)}`
                            : money(r.budgetMax ?? r.budgetMin ?? 0)}
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
                      {fu && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11.5px] font-semibold text-muted-600">{fu.text}</span>
                          <Badge tone={fu.tone}>{fu.badge}</Badge>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-[12.5px] font-medium text-muted-400">
                    No leads match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <ListNote>
        Form fields, stages and lost reasons are configured in Masters → Lead Settings. Dropping a
        card on Lost asks for a reason and remarks.
      </ListNote>

      {creating && (
        <NewLeadModal
          sources={sources}
          projects={projects}
          unitTypes={unitTypes}
          formFields={formFields}
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
    </div>
  );
}

/* ------------------------------- Modals ---------------------------------- */

function NewLeadModal({
  sources, projects, unitTypes, formFields, onClose, onSaved,
}: {
  sources: Lookup; projects: Lookup; unitTypes: Lookup;
  /** What Masters → Lead Settings says this form asks, in its order. */
  formFields: LeadField[];
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
    <Drawer
      open onClose={onClose} title="Capture lead"
      description="Form is built from Masters → Lead Settings"
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={busy}>Save lead</Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={onSubmit} className="space-y-[13px]">
        {error && <Alert tone="error">{error}</Alert>}

        {formFields.map((f) => {
          if (!f.isSystem) {
            return (
              <Field key={f.id} label={f.label} required={f.required}>
                {f.type === "DESCRIPTION" ? (
                  <Textarea name={`custom:${f.id}`} rows={2} required={f.required} placeholder="Type here…" />
                ) : f.type === "CHECKBOX" ? (
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-navy-900">
                    <input type="checkbox" name={`custom:${f.id}`} className="h-4 w-4 accent-brand-500" />
                    Yes
                  </label>
                ) : (
                  <Input
                    name={`custom:${f.id}`}
                    required={f.required}
                    placeholder={placeholderFor(f.type)}
                    type={
                      f.type === "NUMBER" ? "number"
                        : f.type === "DATE" ? "date"
                          : f.type === "EMAIL" ? "email"
                            : f.type === "PHONE" ? "tel"
                              : "text"
                    }
                  />
                )}
              </Field>
            );
          }
          switch (f.fieldKey) {
            case "name":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="name" required={f.required} placeholder="Type here" /></Field>;
            case "phone":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <div className="flex gap-2">
                    <Select
                      name="phoneCode"
                      defaultValue="+91 India"
                      className="w-[132px] shrink-0 px-2 text-[12px]"
                      aria-label="Country code"
                    >
                      {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Input
                      name="phone"
                      type="tel"
                      required={f.required}
                      placeholder={placeholderFor("PHONE")}
                    />
                  </div>
                </Field>
              );
            case "sourceId":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <Select name="sourceId" required={f.required} defaultValue="">
                    <option value="">Select…</option>
                    {sources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </Field>
              );
            case "email":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="email" type="email" required={f.required} placeholder="Type here" /></Field>;
            case "budgetMax":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="budgetMax" type="number" min={0} step="any" required={f.required} placeholder={placeholderFor("NUMBER")} /></Field>;
            case "unitTypeId":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <Select name="unitTypeId" required={f.required} defaultValue="">
                    <option value="">Select…</option>
                    {unitTypes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
              );
            case "projectId":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <Select name="projectId" required={f.required} defaultValue="">
                    <option value="">Select…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              );
            case "requirement":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <Textarea name="requirement" rows={2} required={f.required} placeholder="Type here…" />
                </Field>
              );
            case "siteVisitPlanned":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-navy-900">
                    <input type="checkbox" name="siteVisitPlanned" className="h-4 w-4 accent-brand-500" />
                    Yes
                  </label>
                </Field>
              );
            default:
              return null;
          }
        })}
      </form>
    </Drawer>
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

