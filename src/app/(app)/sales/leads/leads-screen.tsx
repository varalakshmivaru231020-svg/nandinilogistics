"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ListNote } from "@/components/list/list-note";
import {
  LEAD_EMPTY, LEAD_NOTE, leadFollowUp, stageTone, type StageRef,
} from "@/lib/sales/lead-display";
import type { LeadListParams } from "@/lib/sales/lead-list";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/sales/follow-up-display";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { COUNTRY_CODES } from "@/lib/forms/dial-codes";
import { cn, maskPhone, phone } from "@/lib/utils";
import { changeLeadStageAction, createLeadAction, logFollowUpAction } from "./actions";

interface Lead {
  id: string; leadNo: string; name: string; phone: string; email: string | null;
  location: string | null;
  stageId: string; stageName: string; stageKind: string;
  ownerId: string | null; ownerName: string | null;
  companies: string[]; requirement: string | null;
  nextActionAt: string | null; lostReason: string | null;
  followUpCount: number; isDuplicate: boolean; approval: string;
}

type Lookup = Array<{ id: string; name: string }>;

/** What the design puts in an empty box, by the kind of thing it asks for. */
const PLACEHOLDER: Record<string, string> = {
  PHONE: "98765 43210 (without country code)",
  NUMBER: "e.g. 25",
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

/** The count pill on a column, by what the stage means. */
const COUNT_PILL: Record<string, string> = {
  ONBOARDING: "bg-good-600", LOST: "bg-bad-700",
};

const followUp = leadFollowUp;

export function LeadsScreen({
  leads, stages, companies, teleCallers, lostReasons, formFields, can,
  filters, view, nowMs, totalLeads, openLeads,
}: {
  formFields: LeadField[];
  leads: Lead[];
  /** Every lead in the actor's scope, and those still open — for the header. */
  totalLeads: number;
  openLeads: number;
  /** The pipeline, as Masters orders it. */
  stages: StageRef[];
  companies: Lookup;
  /** Who a lead can be assigned to. Empty when the viewer may not choose. */
  teleCallers: Lookup;
  lostReasons: Lookup;
  can: Record<string, boolean>;
  filters: LeadListParams;
  view: "board" | "list";
  nowMs: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(false);
  const [staging, setStaging] = React.useState<{ lead: Lead; stage: StageRef } | null>(null);
  const [followingUp, setFollowingUp] = React.useState<Lead | null>(null);
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
  async function moveTo(leadId: string, stage: StageRef) {
    setDragging(null);
    setDropTarget(null);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === stage.id) return;
    if (stage.kind === "LOST") {
      setStaging({ lead, stage });
      return;
    }
    setError(null);
    const res = await changeLeadStageAction(leadId, stage.id);
    if (!res.ok) setError(res.error);
    else {
      setNotice(`Moved to ${stage.name}.`);
      router.refresh();
    }
  }

  const byStage = new Map<string, Lead[]>();
  for (const l of leads) byStage.set(l.stageId, [...(byStage.get(l.stageId) ?? []), l]);

  const filtersActive =
    Boolean(filters.q) || Boolean(filters.stage) || Boolean(filters.company) ||
    Boolean(filters.owner) || Boolean(filters.fu) || Boolean(filters.from) || Boolean(filters.to);

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
      <div className="mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <Input
          defaultValue={filters.q}
          placeholder="Search name, phone or location…"
          className="w-[230px] py-[9px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <span className="text-[11px] font-semibold text-muted-400">Stage</span>
        <Select value={filters.stage || "all"} onChange={(e) => setParam({ stage: e.target.value })} className="w-auto min-w-[130px] px-[11px] py-[9px] text-[12px] font-semibold">
          <option value="all">All stages</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Company</span>
        <Select value={filters.company || "all"} onChange={(e) => setParam({ company: e.target.value })} className="w-auto min-w-[130px] px-[11px] py-[9px] text-[12px] font-semibold">
          <option value="all">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {can.viewAll && (
          <>
            <span className="text-[11px] font-semibold text-muted-400">Tele-caller</span>
            <Select value={filters.owner || "all"} onChange={(e) => setParam({ owner: e.target.value })} className="w-auto min-w-[130px] px-[11px] py-[9px] text-[12px] font-semibold">
              <option value="all">Anyone</option>
              {teleCallers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </>
        )}
        <span className="text-[11px] font-semibold text-muted-400">Follow-up</span>
        <Select value={filters.fu || "all"} onChange={(e) => setParam({ fu: e.target.value })} className="w-auto min-w-[130px] px-[11px] py-[9px] text-[12px] font-semibold">
          <option value="all">Any follow-up</option>
          <option value="today">Due today</option>
          <option value="overdue">Overdue</option>
          <option value="week">Next 7 days</option>
          <option value="none">Not set</option>
        </Select>
        <span className="text-[11px] font-semibold text-muted-400">Captured</span>
        <Input type="date" defaultValue={filters.from} className="w-auto py-[9px]" aria-label="Captured from"
          onChange={(e) => setParam({ from: e.target.value || undefined })} />
        <Input type="date" defaultValue={filters.to} className="w-auto py-[9px]" aria-label="Captured to"
          onChange={(e) => setParam({ to: e.target.value || undefined })} />
        <div className="flex-1" />
        <span className="text-[11.5px] font-semibold text-muted-600">
          {leads.length} of {totalLeads} leads shown
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setParam({ q: undefined, stage: undefined, company: undefined, owner: undefined, fu: undefined, from: undefined, to: undefined })}
            className="rounded-[8px] border border-bad-100 bg-bad-050 px-3 py-[7px] text-[11.5px] font-semibold text-bad-700 hover:brightness-95"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ------------------------------- Board -------------------------------- */}
      {/*
       * One row, always: a pipeline is a sequence, so it scrolls sideways and
       * the order survives any width. The columns are the active stages, in
       * the order Masters gives them.
       */}
      {view === "board" && (
        <div className="scroll-thin overflow-x-auto pb-2">
        <div
          className="grid items-start gap-3"
          style={{
            gridTemplateColumns: `repeat(${stages.length}, minmax(210px, 1fr))`,
            minWidth: `${stages.length * 210 + (stages.length - 1) * 12}px`,
          }}
        >
          {stages.map((col) => {
            const cards = byStage.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  if (!can.changeStage) return;
                  e.preventDefault();
                  setDropTarget(col.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === col.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && can.changeStage) moveTo(dragging, col);
                }}
                className={cn(
                  "min-w-0 rounded-[13px] p-2.5 transition-colors",
                  dropTarget === col.id ? "bg-brand-100 ring-2 ring-brand-500" : "bg-line-200",
                )}
              >
                <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                  <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-navy-600">
                    {col.name}
                  </span>
                  <span
                    className={cn(
                      "num rounded-full px-2.5 py-[3px] text-[10.5px] font-bold text-white",
                      COUNT_PILL[col.kind] ?? "bg-navy-950",
                    )}
                  >
                    {cards.length}
                  </span>
                </div>

                <div className="flex min-h-[60px] flex-col gap-2">
                  {cards.slice(0, 6).map((c) => {
                    const fu = followUp(c.nextActionAt, nowMs);
                    return (
                      <div
                        key={c.id}
                        draggable={can.changeStage && c.approval === "APPROVED"}
                        onDragStart={() => setDragging(c.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => router.push(`/sales/leads/${c.id}`)}
                        className={cn(
                          "rounded-[11px] border border-line-400 bg-white px-[13px] py-3 transition-shadow",
                          can.changeStage && c.approval === "APPROVED" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          dragging === c.id && "opacity-40",
                          "hover:border-brand-150 hover:shadow-[0_6px_18px_rgba(25,26,92,.1)]",
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-1.5">
                          <span className="text-[12.5px] font-bold text-navy-950">{c.name}</span>
                          {c.isDuplicate && <Copy className="h-3 w-3 shrink-0 text-warn-700" />}
                          {c.approval !== "APPROVED" && (
                            <Badge tone={c.approval === "REJECTED" ? "bad" : "warn"}>
                              {c.approval === "REJECTED" ? "Rejected" : "Pending approval"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11.5px] font-medium text-navy-500">
                          {[c.companies.join(", "), c.location].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <div className="mt-[7px] text-[11.5px] font-semibold text-brand-700">
                          <PhoneLink phone={c.phone} visible={can.viewContact} />
                        </div>
                        {c.ownerName && (
                          <p className="mt-1 text-[10.5px] font-medium text-muted-400">{c.ownerName}</p>
                        )}

                        {fu ? (
                          <div className={cn("mt-2 flex flex-col gap-1 rounded-[8px] border border-l-[3px] px-[9px] py-[7px]", FU_BLOCK[fu.tone])}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-extrabold tracking-[.06em]">FOLLOW-UP</span>
                              <span className="rounded-full bg-current px-[7px] py-[3px] text-[8.5px] font-extrabold tracking-[.06em]">
                                <span className="text-white">{fu.badge.toUpperCase()}</span>
                              </span>
                            </div>
                            <span className="text-[10.5px] font-semibold opacity-85">{fu.text}</span>
                          </div>
                        ) : col.kind !== "LOST" ? (
                          <div className="mt-2 rounded-[8px] border border-dashed border-amber-200 bg-warn-050 px-[9px] py-1.5 text-[10.5px] font-semibold text-warn-700">
                            No follow-up set
                          </div>
                        ) : null}

                        {col.kind === "LOST" && c.lostReason && (
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
        </div>
      )}

      {view === "list" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Lead", "Companies · location", "Tele-caller", "Stage", "Next follow-up"].map((h) => (
                  <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((r) => {
                const fu = followUp(r.nextActionAt, nowMs);
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/sales/leads/${r.id}`)}
                    className="cursor-pointer border-b border-line-150 last:border-0 hover:bg-surface-tint"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-navy-950">{r.name}</span>
                        <span className="num text-[10.5px] font-medium text-muted-400">{r.leadNo}</span>
                        {r.isDuplicate && <Copy className="h-3 w-3 text-warn-700" />}
                        {r.approval !== "APPROVED" && (
                          <Badge tone={r.approval === "REJECTED" ? "bad" : "warn"}>
                            {r.approval === "REJECTED" ? "Rejected" : "Pending approval"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-brand-700">
                        <PhoneLink phone={r.phone} visible={can.viewContact} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-navy-500">
                      {r.companies.join(", ") || "—"}
                      {r.location && <div className="text-[11px] text-muted-400">{r.location}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-navy-500">{r.ownerName ?? "Unassigned"}</td>
                    <td className="px-4 py-3.5">
                      <Badge tone={stageTone(r.stageKind)}>{r.stageName}</Badge>
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
                      {can.followUp && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFollowingUp(r); }}
                          className="mt-1 text-[11px] font-bold text-brand-700 hover:underline"
                        >
                          + Log follow-up
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[12.5px] font-medium text-muted-400">
                    {LEAD_EMPTY.title}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <ListNote>{LEAD_NOTE}</ListNote>

      {creating && (
        <NewLeadModal
          companies={companies}
          teleCallers={teleCallers}
          mustAssign={can.assign}
          formFields={formFields}
          onClose={() => setCreating(false)}
          onSaved={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}
      {staging && (
        <LostModal
          lead={staging.lead}
          stage={staging.stage}
          lostReasons={lostReasons}
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
    </div>
  );
}

/** The number as a click-to-call link — or masked, for somebody who may not see it. */
export function PhoneLink({ phone: raw, visible }: { phone: string; visible: boolean }) {
  if (!visible) return <span>📞 {maskPhone(raw)}</span>;
  return (
    <a
      href={`tel:${raw.replace(/[^\d+]/g, "")}`}
      onClick={(e) => e.stopPropagation()}
      className="hover:underline"
      title="Call"
    >
      📞 {phone(raw)}
    </a>
  );
}

/* ------------------------------- Modals ---------------------------------- */

function NewLeadModal({
  companies, teleCallers, mustAssign, formFields, onClose, onSaved,
}: {
  companies: Lookup;
  teleCallers: Lookup;
  /** Admin and a Team Leader must name the tele-caller. */
  mustAssign: boolean;
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
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={busy} className="px-[18px]">Save lead</Button>
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
                  <Textarea name={`custom:${f.id}`} required={f.required} placeholder="Type here…" className="min-h-[70px]" />
                ) : f.type === "CHECKBOX" ? (
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-navy-900">
                    <input type="checkbox" name={`custom:${f.id}`} className="my-[3px] mr-[3px] ml-[4px] h-[15px] w-[15px] accent-brand-500" />
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
                    <Input name="phone" type="tel" required={f.required} placeholder={placeholderFor("PHONE")} />
                  </div>
                </Field>
              );
            case "altPhone":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="altPhone" type="tel" required={f.required} placeholder={placeholderFor("PHONE")} /></Field>;
            case "email":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="email" type="email" required={f.required} placeholder="Type here" /></Field>;
            case "location":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="location" required={f.required} placeholder="Area or hub" /></Field>;
            case "companyIds":
              return (
                <Field key={f.id} label={f.label} required={f.required} hint="Hold Ctrl / ⌘ to tag more than one.">
                  <Select name="companyIds" multiple required={f.required} className="min-h-[88px]">
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              );
            case "ownerId":
              if (!mustAssign) return null;
              return (
                <Field key={f.id} label={f.label} required hint="Assignment is mandatory when you create a lead.">
                  <Select name="ownerId" required defaultValue="">
                    <option value="">Select a tele-caller…</option>
                    {teleCallers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
              );
            case "requirement":
              return (
                <Field key={f.id} label={f.label} required={f.required}>
                  <Textarea name="requirement" required={f.required} placeholder="Type here…" className="min-h-[70px]" />
                </Field>
              );
            case "nextActionAt":
              return <Field key={f.id} label={f.label} required={f.required}><Input name="nextActionAt" type="date" required={f.required} placeholder={placeholderFor("DATE")} /></Field>;
            default:
              return null;
          }
        })}
      </form>
    </Drawer>
  );
}

/** The design asks for a reason before a lead may sit on a Lost stage. */
function LostModal({
  lead, stage, lostReasons, onClose, onSaved, onError,
}: {
  lead: Lead; stage: StageRef; lostReasons: Lookup;
  onClose: () => void; onSaved: (m: string) => void; onError: (e: string) => void;
}) {
  const [lostReasonId, setLostReasonId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await changeLeadStageAction(lead.id, stage.id, lostReasonId || undefined, notes);
    setBusy(false);
    if (!res.ok) { setError(res.error); onError(res.error); }
    else onSaved(`${lead.name} moved to ${stage.name}.`);
  }

  return (
    <Modal
      open onClose={onClose} title={`Mark ${lead.name} as ${stage.name}`}
      description="A mandatory reason is captured when a lead is marked lost."
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!lostReasonId}>Mark lost</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Lost reason" required>
          <Select value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
            <option value="">Select a reason…</option>
            {lostReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Remarks"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function FollowUpModal({
  lead, onClose, onSaved,
}: { lead: Lead; onClose: () => void; onSaved: (m: string) => void }) {
  const [channel, setChannel] = React.useState<string>("CALL");
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
      description={[lead.stageName, lead.ownerName ? `with ${lead.ownerName}` : null]
        .filter(Boolean)
        .join(" · ")}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          <Button onClick={submit} loading={busy} disabled={!notes.trim()}>Save follow-up</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Channel" required>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="What happened" required>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} autoFocus />
        </Field>
        <Field label="Outcome">
          <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Interested / Call back / Not reachable" />
        </Field>
        <Field label="Next follow-up on" hint="Leaving this blank drops the lead off the follow-up list.">
          <Input type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
