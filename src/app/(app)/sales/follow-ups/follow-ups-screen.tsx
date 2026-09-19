"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, phone } from "@/lib/utils";
import { logFollowUpAction } from "../leads/actions";

export interface FollowUpRow {
  id: string; leadNo: string; name: string; phone: string;
  requirement: string | null; source: string; ownerName: string | null;
  state: string; channel: string; remarks: string; outcome: string | null;
  dueAt: string;
}

const CHANNEL_ICON: Record<string, string> = {
  CALL: "📞", WHATSAPP: "💬", EMAIL: "✉️", MEETING: "🤝", SITE_VISIT: "📍",
};
const CHANNEL_LABEL: Record<string, string> = {
  CALL: "Call", WHATSAPP: "WhatsApp", EMAIL: "Email", MEETING: "Meeting", SITE_VISIT: "Site visit",
};

const DAY = 86_400_000;

/** The design's buckets, oldest pressure first. */
type BucketKey = "overdue" | "today" | "tomorrow" | "week" | "later";

const BUCKETS: Array<{ key: BucketKey; name: string; tone: string }> = [
  { key: "overdue", name: "Overdue", tone: "text-bad-700" },
  { key: "today", name: "Today", tone: "text-warn-700" },
  { key: "tomorrow", name: "Tomorrow", tone: "text-brand-700" },
  { key: "week", name: "This Week", tone: "text-plum-700" },
  { key: "later", name: "Later", tone: "text-slate-600" },
];

function bucketOf(dueAt: string, nowMs: number): BucketKey {
  const now = new Date(nowMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(dueAt).getTime();
  if (due < startToday) return "overdue";
  if (due < startToday + DAY) return "today";
  if (due < startToday + 2 * DAY) return "tomorrow";
  if (due < startToday + 7 * DAY) return "week";
  return "later";
}

/** The design writes "01/09/2026, 16:30" and one word beside it. */
function whenLabel(dueAt: string, nowMs: number) {
  const bucket = bucketOf(dueAt, nowMs);
  const text = new Date(dueAt).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  if (bucket === "overdue") return { text, badge: "OVERDUE", pill: "bg-bad-700", tone: "text-bad-700" };
  if (bucket === "today") return { text, badge: "TODAY", pill: "bg-warn-700", tone: "text-warn-700" };
  return { text, badge: "UPCOMING", pill: "bg-brand-700", tone: "text-brand-700" };
}

/** The design's solid type chip: blue for a call, violet for a site visit. */
const CHANNEL_PILL: Record<string, string> = {
  CALL: "bg-brand-700", WHATSAPP: "bg-good-700", EMAIL: "bg-navy-800",
  MEETING: "bg-navy-800", SITE_VISIT: "bg-plum-600",
};

export function FollowUpsScreen({
  rows, view, query, typeFilter, month, nowMs, canLog,
}: {
  rows: FollowUpRow[];
  view: "grid" | "list" | "calendar";
  query: string;
  typeFilter: string;
  month: string;
  nowMs: number;
  canLog: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [logging, setLogging] = React.useState<FollowUpRow | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function setParam(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`?${sp.toString()}`);
  }

  const grouped = new Map<BucketKey, FollowUpRow[]>();
  for (const r of rows) {
    const b = bucketOf(r.dueAt, nowMs);
    grouped.set(b, [...(grouped.get(b) ?? []), r]);
  }

  return (
    <div className="animate-fade-up">
      {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

      {/* Header */}
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <p className="text-[13px] font-medium text-muted-600">
          {rows.length} shown · every scheduled call and site visit across all leads
        </p>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          {([["grid", "▦", "Grid"], ["list", "☰", "List"], ["calendar", "▤", "Calendar"]] as const).map(
            ([v, glyph, label]) => (
              <button
                key={v}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={view === v}
                onClick={() => setParam({ view: v === "grid" ? undefined : v })}
                className={cn(
                  "rounded-[8px] border px-3.5 py-2 text-[13px] font-bold transition-colors",
                  view === v
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-muted-600 hover:border-brand-300",
                )}
              >
                {glyph}
              </button>
            ),
          )}
        </div>
        <Link href="/sales/leads">
          <Button size="md">+ New follow-up</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <Input
          defaultValue={query}
          placeholder="Search lead, purpose, remarks…"
          className="w-[280px] py-[9px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <Select value={typeFilter} onChange={(e) => setParam({ type: e.target.value })} className="w-auto min-w-[150px] px-[11px] py-[9px] text-[12px] font-semibold">
          <option value="all">All types</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>

      {/* --------------------------------- Grid -------------------------------- */}
      {view === "grid" && (
        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(215px,1fr))]">
          {BUCKETS.map((b) => {
            const cards = grouped.get(b.key) ?? [];
            return (
              <div key={b.key} className="rounded-[13px] bg-line-200 p-3">
                <div className={cn("font-display text-[15px] font-extrabold", b.tone)}>{b.name}</div>
                <div className="mb-[11px] mt-[3px] text-[11.5px] font-medium text-muted-500">
                  {cards.length} follow-up{cards.length === 1 ? "" : "s"}
                </div>
                <div className="flex flex-col gap-2">
                  {cards.slice(0, 6).map((c) => {
                    const w = whenLabel(c.dueAt, nowMs);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setLogging(c)}
                        className="rounded-[11px] border border-line-400 bg-white px-[13px] py-3 text-left transition-shadow hover:border-brand-150 hover:shadow-[0_6px_18px_rgba(25,26,92,.1)]"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-white",
                            CHANNEL_PILL[c.channel] ?? "bg-brand-700",
                          )}
                        >
                          <span>{CHANNEL_ICON[c.channel] ?? "📞"}</span>
                          {CHANNEL_LABEL[c.channel] ?? c.channel}
                        </span>
                        <div className="mt-2 text-[13px] font-bold text-navy-950">{c.name}</div>
                        <div className="mt-1 text-[12px] font-bold text-brand-700">📞 {phone(c.phone)}</div>
                        {c.requirement && (
                          <div className="mt-0.5 line-clamp-1 text-[11.5px] font-medium text-muted-500">
                            {c.requirement}
                          </div>
                        )}
                        <div className="mt-1.5 line-clamp-2 text-[11.5px] font-medium text-navy-500">
                          {c.remarks}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={cn("text-[11px] font-semibold", w.tone)}>🕒 {w.text}</span>
                          <span
                            className={cn(
                              "rounded-full px-[7px] py-[3px] text-[8.5px] font-extrabold tracking-[.06em] text-white",
                              w.pill,
                            )}
                          >
                            {w.badge}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {cards.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setParam({ view: "list" })}
                      className="rounded-[8px] border border-brand-100 bg-brand-100 py-2 text-center text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-300/25"
                    >
                      + {cards.length - 6} more · switch to List view
                    </button>
                  )}
                  {cards.length === 0 && (
                    <div className="py-5 text-center text-[12px] font-medium text-muted-300">
                      Nothing here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --------------------------------- List -------------------------------- */}
      {view === "list" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Type", "Lead", "Remarks", "When", "Bucket"].map((h) => (
                  <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const w = whenLabel(r.dueAt, nowMs);
                const b = BUCKETS.find((x) => x.key === bucketOf(r.dueAt, nowMs))!;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setLogging(r)}
                    className="cursor-pointer border-b border-line-150 last:border-0 hover:bg-surface-tint"
                  >
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-field px-2 py-0.5 text-[10px] font-bold text-navy-600">
                        <span>{CHANNEL_ICON[r.channel] ?? "📞"}</span>
                        {CHANNEL_LABEL[r.channel] ?? r.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[13px] font-bold text-navy-950">{r.name}</div>
                      <div className="mt-0.5 text-[12px] font-bold text-brand-700">📞 {phone(r.phone)}</div>
                      <div className="text-[11px] font-medium text-muted-400">
                        {r.requirement ?? r.leadNo}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-medium text-navy-500">{r.remarks}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-[12px] font-semibold", w.tone)}>{w.text}</span>
                        <span
                          className={cn(
                            "rounded-full px-[7px] py-[3px] text-[8.5px] font-extrabold tracking-[.06em] text-white",
                            w.pill,
                          )}
                        >
                          {w.badge}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn("text-[12px] font-bold", b.tone)}>{b.name}</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[12.5px] font-medium text-muted-400">
                    Nothing scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* ------------------------------- Calendar ------------------------------ */}
      {view === "calendar" && (
        <CalendarView rows={rows} month={month} nowMs={nowMs} onOpen={setLogging} onMonth={(m) => setParam({ month: m })} />
      )}

      {logging && (
        <LogModal
          row={logging}
          canLog={canLog}
          onClose={() => setLogging(null)}
          onSaved={(m) => { setLogging(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------- Calendar -------------------------------- */

function CalendarView({
  rows, month, nowMs, onOpen, onMonth,
}: {
  rows: FollowUpRow[];
  month: string;
  nowMs: number;
  onOpen: (r: FollowUpRow) => void;
  onMonth: (m: string) => void;
}) {
  const [year, mon] = month.split("-").map(Number);
  const first = new Date(year, mon - 1, 1);
  const startDow = first.getDay(); // Sunday-first, as the design lays it out
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayKey = new Date(nowMs).toDateString();

  const byDay = new Map<number, FollowUpRow[]>();
  for (const r of rows) {
    const d = new Date(r.dueAt);
    if (d.getFullYear() === year && d.getMonth() === mon - 1) {
      byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), r]);
    }
  }

  function shift(delta: number) {
    const d = new Date(year, mon - 1 + delta, 1);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const cells: Array<number | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Card className="px-[18px] py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-line-400 bg-white text-navy-600 hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-[15px] font-bold text-navy-950">
          {first.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-line-400 bg-white text-navy-600 hover:bg-surface-hover"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="pb-1 text-center text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} />;
          const items = byDay.get(day) ?? [];
          const isToday = new Date(year, mon - 1, day).toDateString() === todayKey;
          return (
            <div
              key={day}
              className={cn(
                "min-h-[92px] rounded-[10px] border p-1.5",
                isToday ? "border-brand-500 bg-brand-100" : "border-line-300 bg-surface-sunken",
              )}
            >
              <div className={cn("mb-1 text-[11px] font-bold", isToday ? "text-brand-700" : "text-muted-500")}>
                {day}
              </div>
              <div className="flex flex-col gap-1">
                {items.slice(0, 3).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpen(r)}
                    className="truncate rounded-[6px] bg-white px-1.5 py-1 text-left text-[10.5px] font-semibold text-navy-900 ring-1 ring-line-400 hover:ring-brand-500"
                  >
                    {CHANNEL_ICON[r.channel] ?? "📞"} {r.name}
                  </button>
                ))}
                {items.length > 3 && (
                  <span className="text-[10px] font-bold text-brand-700">+{items.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* --------------------------------- Modal ---------------------------------- */

function LogModal({
  row, canLog, onClose, onSaved,
}: { row: FollowUpRow; canLog: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const [channel, setChannel] = React.useState(row.channel === "SITE_VISIT" ? "SITE_VISIT" : "CALL");
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [nextActionAt, setNextActionAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await logFollowUpAction(row.id, channel, notes, outcome, nextActionAt);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved("Follow-up logged.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${row.name} · ${row.leadNo}`}
      description={`${CHANNEL_LABEL[row.channel] ?? row.channel} due ${formatDate(row.dueAt)}${row.ownerName ? ` · ${row.ownerName}` : ""}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          {canLog && (
            <Button onClick={submit} loading={busy} disabled={!notes.trim()}>Save follow-up</Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="rounded-[10px] bg-surface-sunken px-3 py-2.5">
          <p className="text-[12px] font-bold text-brand-700">📞 {phone(row.phone)}</p>
          {row.requirement && (
            <p className="mt-1 text-[11.5px] font-medium text-muted-600">{row.requirement}</p>
          )}
          <p className="mt-1 text-[11.5px] font-medium text-navy-500">{row.remarks}</p>
        </div>

        {!canLog ? (
          <Alert tone="warn">You can see this follow-up but not log against it.</Alert>
        ) : (
          <>
            <Field label="Channel" required>
              <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="What happened" required>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} autoFocus />
            </Field>
            <Field label="Outcome">
              <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Interested / Call back / Not reachable" />
            </Field>
            <Field label="Next action on" hint="Leaving this blank drops the lead off this list.">
              <Input type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
