"use client";

import * as React from "react";

import { ATTENDANCE_EMPTY, ATTENDANCE_MARK_EMPTY, EMPLOYEE_EMPTY } from "@/lib/hr/list-display";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Alert, Badge, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { decideApprovalAction } from "@/app/(app)/approvals/actions";
import { cn } from "@/lib/utils";
import { personalAddress, professionalAddress } from "@/lib/hr/address";
import type { AttendanceSummaryRow } from "@/lib/hr/attendance-report";
import { isInactive, statusLabel } from "@/lib/hr/employee-status";
import { ONBOARDING_LABEL, ONBOARDING_TONE } from "@/lib/riders/onboarding";
import { deleteEmployeeAction, markAttendanceAction, setEmployeeStatusAction } from "./actions";
import type { Employee } from "./employee-form";

/**
 * The design colours the employment type: staff navy, a contract purple, and
 * direct labour green. Anything else stays slate.
 */


const TYPE_PILL: Record<string, string> = {
  "rider": "bg-good-050 text-good-700",
  "internal staff": "bg-surface-hover text-navy-800",
  "team leader": "bg-plum-050 text-plum-700",
};

const ONBOARDING_PILL: Record<string, string> = {
  draft: "bg-surface-field text-navy-500",
  warn: "bg-warn-050 text-warn-700",
  good: "bg-good-050 text-good-700",
  bad: "bg-bad-050 text-bad-700",
};

const typePill = (name: string) =>
  TYPE_PILL[name.trim().toLowerCase()] ?? "bg-surface-field text-navy-500";

/** The design tints each employee's initials from a four-colour palette. */
const AVATAR_COLOURS = ["#0089C9", "#2F308C", "#1F9D66", "#E8A13A"];

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function initialsIndex(name: string) {
  return name.length % AVATAR_COLOURS.length;
}
interface Mark {
  employeeId: string; status: string; overtimeHours: number;
  /** Check in / out on the Indian clock, and a Maps link where a location was shared. */
  checkIn?: string | null; checkOut?: string | null;
  inMap?: string | null; outMap?: string | null;
  /** Checked in on a past day and never out. */
  noCheckOut?: boolean;
}
/** Someone who can be marked — active employees only. */
interface MarkRow { id: string; code: string; name: string; employmentType: string; designation: string | null }

/** One day of one person in the punch log. */
export interface LogRow {
  id: string; date: string; name: string; code: string; employmentType: string;
  status: string; overtimeHours: number;
  checkIn: string | null; checkOut: string | null; hours: number | null;
  inMap: string | null; outMap: string | null;
  /** Where the row came from — the app, or whoever marked it. */
  source: string;
  noCheckOut: boolean;
}

/** The design's three marks, with its own colours. */
const MARKS = [
  { key: "PRESENT", short: "P", label: "Present", tone: "good" as const },
  { key: "ABSENT", short: "A", label: "Absent", tone: "bad" as const },
  { key: "HALF_DAY", short: "H", label: "Half day", tone: "warn" as const },
];

const TABS = [
  { key: "staff", label: "Riders & Staff" },
  { key: "mark", label: "Mark Attendance" },
  { key: "log", label: "Punch Log" },
  { key: "report", label: "Attendance Report" },
];

export function HrScreen({
  tabs, view = "riders", newLabel,
  tab, date, from, to, rangeError, employees, markable, dayMarks, report, log = [], can,
}: {
  /** Which tabs this sidebar entry shows — the list, or mark and report. */
  tabs: string[];
  /**
   * Which people this entry is about. The Internal Staff page offers the staff
   * employment types (Internal Staff, Team Leader — the tele-callers, managers
   * and leaders); the Riders page offers Rider. A form opened from the staff
   * page used to default to Rider whenever the viewer could not add staff,
   * which is the one type that page is not for.
   */
  view?: "riders" | "staff" | "attendance";
  /** "+ New rider" or "+ New staff member". */
  newLabel: string;
  tab: string; date: string; from: string; to: string;
  /** Why the report range was refused, or null. */
  rangeError: string | null;
  employees: Employee[]; markable: MarkRow[];
  dayMarks: Mark[]; report: AttendanceSummaryRow[];
  /** The punch log for the range, newest first. */
  log?: LogRow[];
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);
  const [removing, setRemoving] = React.useState<Employee | null>(null);
  // A new record waiting for approval, decided from its row.
  const [deciding, setDeciding] = React.useState<{ e: Employee; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [decisionNote, setDecisionNote] = React.useState("");
  const [statusTarget, setStatusTarget] = React.useState<Employee | null>(null);
  const [statusReason, setStatusReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function setParam(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") q.delete(k); else q.set(k, v);
    }
    router.push(`${pathname}?${q.toString()}`);
  }

  const visibleTabs = TABS.filter(
    (t) =>
      tabs.includes(t.key) &&
      (t.key !== "staff" || can.tabStaff) &&
      (t.key !== "mark" || can.viewAttendance) &&
      (t.key !== "log" || can.log) &&
      (t.key !== "report" || can.report),
  );
  const active = visibleTabs.some((t) => t.key === tab) ? tab : (visibleTabs[0]?.key ?? "staff");

  function flash(message: string) {
    toast(message);
    router.refresh();
  }

  async function removeEmployee() {
    if (!removing) return;
    setBusy(true);
    const res = await deleteEmployeeAction(removing.id);
    setBusy(false);
    if (!res.ok) { setError(res.error); setRemoving(null); return; }
    setRemoving(null);
    flash(res.data?.pending ? `Deletion of ${removing.name} sent for approval` : `${removing.name} removed`);
  }

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    const res = await decideApprovalAction("RIDER", deciding.e.id, deciding.decision, decisionNote);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const { e, decision } = deciding;
    setDeciding(null);
    setDecisionNote("");
    flash(`${e.name} ${decision === "APPROVED" ? "approved" : "rejected"}`);
  }

  function openStatus(e: Employee) {
    setStatusReason("");
    setStatusTarget(e);
  }

  async function changeStatus() {
    if (!statusTarget) return;
    const next = isInactive(statusTarget.status) ? "ACTIVE" : "INACTIVE";
    setBusy(true);
    const res = await setEmployeeStatusAction(statusTarget.id, next, statusReason);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setStatusTarget(null);
    flash(res.data?.pending
      ? `Request to mark ${statusTarget.name} ${statusLabel(next).toLowerCase()} sent for approval`
      : `${statusTarget.name} marked ${statusLabel(next).toLowerCase()}`);
  }

  const deactivating = statusTarget ? !isInactive(statusTarget.status) : false;

  // The form is a page of its own: /hr/new for a record on this page's
  // types, /hr/[id]/edit for an existing one.
  const openForm = (e: Employee | "new") =>
    router.push(e === "new" ? `/hr/new?type=${view === "staff" ? "staff" : "riders"}` : `/hr/${e.id}/edit`);
  // On the staff page, adding needs the staff permission — otherwise the form
  // would have nothing honest to offer.
  const canAdd = Boolean(can.create) && (view !== "staff" || Boolean(can.createStaff));
  const addBlockedReason = view === "staff" && can.create && !can.createStaff
    ? "Your role cannot add Internal Staff or Team Leader records. Ask Admin to grant it under Administration → Roles."
    : null;

  return (
    <div className="animate-fade-up">
      {/* Tabs, underlined as the design draws them — only when there is a choice */}
      <div className="mb-4 flex flex-wrap items-center gap-[22px] border-b border-line-400">
        {visibleTabs.length > 1 && visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParam({ tab: t.key })}
            className={cn(
              "border-b-[2.5px] px-1 py-[11px] text-[13px] transition-colors",
              active === t.key
                ? "border-brand-500 font-bold text-navy-950"
                : "border-transparent font-semibold text-muted-600 hover:text-navy-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "staff" && (
        <StaffTab
          employees={employees}
          can={can}
          canAdd={canAdd}
          addBlockedReason={addBlockedReason}
          newLabel={newLabel}
          onEdit={openForm}
          onRemove={setRemoving}
          onStatus={openStatus}
          onDecide={(e, decision) => { setDecisionNote(""); setDeciding({ e, decision }); }}
        />
      )}

      {active === "mark" && can.viewAttendance && (
        <MarkTab
          employees={markable}
          date={date}
          marks={dayMarks}
          can={can}
          onDate={(v) => setParam({ date: v })}
          onDone={flash}
          onError={setError}
        />
      )}

      {active === "log" && can.log && (
        <LogTab
          rows={log}
          from={from}
          to={to}
          rangeError={rangeError}
          onRange={(f, t) => setParam({ from: f, to: t })}
        />
      )}

      {active === "report" && can.report && (
        <ReportTab
          rows={report}
          from={from}
          to={to}
          rangeError={rangeError}
          params={params}
          can={can}
          onRange={(f, t) => setParam({ from: f, to: t })}
        />
      )}

      {deciding && (
        <Modal
          open
          onClose={() => setDeciding(null)}
          size="sm"
          title={`${deciding.decision === "APPROVED" ? "Approve" : "Reject"} ${deciding.e.name}?`}
          description={deciding.decision === "APPROVED"
            ? "The record is approved and onboarding can go ahead. Whoever added it is told."
            : "The record stays on file, marked rejected. A reason is required."}
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button type="button" loading={busy} onClick={() => void decide()}>
                {deciding.decision === "APPROVED" ? "Approve" : "Reject"}
              </Button>
            </>
          }
        >
          <Field label={deciding.decision === "APPROVED" ? "Note (optional)" : "Reason"} required={deciding.decision === "REJECTED"}>
            <Textarea value={decisionNote} onChange={(ev) => setDecisionNote(ev.target.value)} className="min-h-[64px]" />
          </Field>
        </Modal>
      )}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove employee?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={removeEmployee} loading={busy}>Delete</Button>
          </>
        }
      >
        <p className="text-[12.5px] font-medium text-muted-600">
          {removing?.name} will be removed from the user master. Anyone who already has
          attendance recorded cannot be deleted — the record has to stay.
        </p>
      </Modal>

      <Modal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={deactivating ? "Deactivate employee?" : "Activate employee?"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button
              variant={deactivating ? "danger" : "primary"}
              onClick={changeStatus}
              loading={busy}
              disabled={deactivating && statusReason.trim().length < 3}
            >
              {deactivating ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12.5px] font-medium text-muted-600">
            {deactivating
              ? `${statusTarget?.name} will no longer appear in Mark Attendance. Attendance already recorded stays in the report.`
              : `${statusTarget?.name} can be marked for attendance again.`}
          </p>
          <Field label="Reason" required={deactivating}>
            <Textarea
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={deactivating ? "e.g. Left the company on 12 Sep" : "Optional"}
              rows={3}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------- Employees -------------------------------- */

function StaffTab({
  employees, can, canAdd, addBlockedReason, newLabel, onEdit, onRemove, onStatus, onDecide,
}: {
  employees: Employee[];
  newLabel: string;
  can: Record<string, boolean>;
  /** Whether the New button is offered on this page, and if not, why. */
  canAdd: boolean;
  addBlockedReason: string | null;
  onEdit: (e: Employee | "new") => void; onRemove: (e: Employee) => void;
  onStatus: (e: Employee) => void;
  onDecide: (e: Employee, decision: "APPROVED" | "REJECTED") => void;
}) {
  return (
    <div>
      {/* The design heads this tab with the count and one button, 13px above the table. */}
      <div className="mb-[13px] flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-600">
          {employees.length} {employees.length === 1 ? "person" : "people"} on record
        </span>
        {canAdd ? (
          <Button size="md" onClick={() => onEdit("new")}>
            {newLabel}
          </Button>
        ) : addBlockedReason ? (
          <span className="text-[12px] font-medium text-muted-500">{addBlockedReason}</span>
        ) : null}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Rider / staff", "Type", "Onboarding", "Companies", "Aadhaar · PAN", "Address", ""].map((h, i) => (
                <th
                  key={h || i}
                  className={cn(
                    "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                    i === 7 ? "text-right" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">
                  {EMPLOYEE_EMPTY.title}
                </td>
              </tr>
            ) : employees.map((e) => (
              <tr
                key={e.id}
                className={cn(
                  "border-b border-line-200 transition-colors last:border-0 hover:bg-surface-hover",
                  isInactive(e.status) && "bg-surface-sunken/60",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-[11px]">
                    {/* The photograph if one was uploaded, initials if not —
                        the same square either way, so rows stay aligned. */}
                    {e.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/hr/photo/${e.id}`}
                        alt={e.name}
                        className="h-[38px] w-[38px] shrink-0 rounded-[10px] object-cover"
                      />
                    ) : (
                      <span
                        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-[12px] font-bold text-white"
                        style={{ background: AVATAR_COLOURS[initialsIndex(e.name)] }}
                      >
                        {initials(e.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className={cn("text-[13px] font-bold", isInactive(e.status) ? "text-muted-500" : "text-navy-950")}>
                        {e.name}
                      </p>
                      <p className="num mt-0.5 text-[11.5px] font-semibold text-brand-700">📞 {e.mobile}</p>
                      <p className="mt-px text-[11px] font-medium text-muted-400">
                        {e.designation ?? "—"} · alt {e.altContact ?? "—"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", typePill(e.employmentType))}>{e.employmentType}</span>
                  {isInactive(e.status) && (
                    <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-surface-field px-2.5 py-[5px] text-[10.5px] font-bold text-navy-500">Left</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", ONBOARDING_PILL[ONBOARDING_TONE[e.onboardingStatus]])}>
                    {ONBOARDING_LABEL[e.onboardingStatus]}
                  </span>
                  {e.approval === "PENDING" && (
                    <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-warn-050 px-2.5 py-[5px] text-[10.5px] font-bold text-warn-800">Pending approval</span>
                  )}
                  {e.approval === "REJECTED" && (
                    <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-[#FCEDED] px-2.5 py-[5px] text-[10.5px] font-bold text-[#B23334]">Rejected</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[12px] font-medium text-navy-500">{e.companies.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-[12px] font-medium text-navy-500">
                  <span className="num">{e.aadhaar ?? "—"}</span>
                  <br />
                  <span className="num text-[11px] text-muted-400">{e.pan ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-[12px] font-medium text-navy-500">
                  <span className="block">{professionalAddress(e) ?? "—"}</span>
                  {personalAddress(e) && (
                    <span className="block text-[11px] text-muted-400">Personal: {personalAddress(e)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {e.approval === "PENDING" ? (
                      <Link
                        href={`/hr/${e.id}`}
                        className="rounded-[7px] bg-brand-500 px-[13px] py-1.5 text-[11px] font-bold text-white hover:bg-brand-600"
                      >
                        View
                      </Link>
                    ) : isInactive(e.status) && can.update ? (
                      <button
                        type="button"
                        onClick={() => onStatus(e)}
                        className="rounded-[7px] bg-brand-500 px-[13px] py-1.5 text-[11px] font-bold text-white hover:bg-brand-600"
                      >
                        Activate
                      </button>
                    ) : (
                      <Link
                        href={`/hr/${e.id}`}
                        className="rounded-[7px] bg-brand-500 px-[13px] py-1.5 text-[11px] font-bold text-white hover:bg-brand-600"
                      >
                        View
                      </Link>
                    )}
                    {can.decide && e.approval === "PENDING" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onDecide(e, "APPROVED")}
                          className="rounded-[7px] bg-good-600 px-3 py-1.5 text-[11px] font-bold text-white hover:brightness-95"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecide(e, "REJECTED")}
                          className="rounded-[7px] border border-bad-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-bad-700 hover:bg-bad-050"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {can.update && e.approval !== "PENDING" && (
                      <button
                        type="button"
                        onClick={() => onEdit(e)}
                        className="rounded-[7px] border border-line-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-navy-500 hover:border-brand-500 hover:text-brand-700"
                      >
                        Edit
                      </button>
                    )}
                    {can.remove && e.approval !== "PENDING" && (
                      <button
                        type="button"
                        onClick={() => onRemove(e)}
                        className="rounded-[7px] border border-bad-100 bg-bad-050 px-3 py-1.5 text-[11px] font-semibold text-bad-700 hover:brightness-95"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ---------------------------- Mark attendance ------------------------------ */

/** The day's check in / out under the marks: times, and where, or "no location". */
function PunchLine({ mark }: { mark?: Mark }) {
  if (!mark?.checkIn) return null;
  const where = (href: string | null | undefined) =>
    href ? <a href={href} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">map</a> : <span className="text-muted-400">no location</span>;
  return (
    <p className="num mt-1 text-[11px] font-medium text-navy-500">
      In {mark.checkIn} ({where(mark.inMap)})
      {mark.checkOut ? <> · Out {mark.checkOut} ({where(mark.outMap)})</> : mark.noCheckOut ? <span className="font-semibold text-warn-700"> · no check-out</span> : null}
    </p>
  );
}

function MarkTab({
  employees, date, marks, can, onDate, onDone, onError,
}: {
  employees: MarkRow[]; date: string; marks: Mark[]; can: Record<string, boolean>;
  onDate: (v: string) => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  // Server marks are the starting point; local edits layer on top.
  const initial = React.useMemo(() => {
    const map: Record<string, { status: string; ot: number }> = {};
    for (const m of marks) map[m.employeeId] = { status: m.status, ot: m.overtimeHours };
    return map;
  }, [marks]);

  const [draft, setDraft] = React.useState<Record<string, { status: string; ot: number }>>(initial);
  const [busy, setBusy] = React.useState(false);

  // Re-seed when the day changes — deriving, not syncing in an effect.
  const [seenDate, setSeenDate] = React.useState(date);
  if (seenDate !== date) { setSeenDate(date); setDraft(initial); }

  const counts = {
    marked: Object.keys(draft).length,
    P: Object.values(draft).filter((d) => d.status === "PRESENT").length,
    H: Object.values(draft).filter((d) => d.status === "HALF_DAY").length,
    A: Object.values(draft).filter((d) => d.status === "ABSENT").length,
  };

  function mark(id: string, status: string) {
    setDraft((d) => ({ ...d, [id]: { status, ot: status === "ABSENT" ? 0 : (d[id]?.ot ?? 0) } }));
  }

  async function save() {
    setBusy(true);
    const res = await markAttendanceAction(
      date,
      Object.entries(draft).map(([employeeId, v]) => ({
        employeeId, status: v.status, overtimeHours: v.ot,
      })),
    );
    setBusy(false);
    if (!res.ok) { onError(res.error); return; }
    onDone(`${res.data.marked} of ${employees.length} marked for ${date}`);
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <Field label="Date" className="w-[170px]">
          <Input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
        </Field>
        {can.markAll && (
          <Button
            size="md"
            variant="secondary"
            onClick={() => setDraft(Object.fromEntries(employees.map((e) => [e.id, { status: "PRESENT", ot: draft[e.id]?.ot ?? 0 }])))}
          >
            All present
          </Button>
        )}
        {can.mark && (
          <Button size="md" onClick={save} loading={busy} disabled={counts.marked === 0}>
            Save attendance
          </Button>
        )}
      </div>

      <div className="mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {[
          { v: `${counts.marked} / ${employees.length}`, l: "Marked", cls: "bg-surface-hover text-navy-800 border-line-400" },
          { v: String(counts.P), l: "Present", cls: "bg-good-050 text-good-700 border-good-050" },
          { v: String(counts.H), l: "Half day", cls: "bg-warn-050 text-warn-700 border-warn-050" },
          { v: String(counts.A), l: "Absent", cls: "bg-bad-050 text-bad-600 border-bad-050" },
        ].map((k) => (
          <div key={k.l} className={cn("rounded-[11px] border px-3.5 py-3", k.cls)}>
            <p className="num font-display text-[20px] font-bold">{k.v}</p>
            <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-80">{k.l}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Employee", "Type", "Mark", "Overtime (hrs)"].map((h) => (
                <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">
                {ATTENDANCE_MARK_EMPTY.title}
              </td></tr>
            ) : employees.map((e) => {
              const d = draft[e.id];
              return (
                <tr key={e.id} className="border-b border-line-200 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-[12.5px] font-bold text-navy-950">{e.name}</p>
                    <p className="text-[11px] font-medium text-muted-400">{e.designation ?? e.code}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", typePill(e.employmentType))}>{e.employmentType}</span></td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1.5">
                      {MARKS.map((m) => {
                        const on = d?.status === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            disabled={!can.mark}
                            onClick={() => mark(e.id, m.key)}
                            className={cn(
                              "rounded-[8px] border px-3 py-1.5 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                              on && m.tone === "good" && "border-good-600 bg-good-050 font-bold text-good-700",
                              on && m.tone === "bad" && "border-bad-600 bg-bad-050 font-bold text-bad-600",
                              on && m.tone === "warn" && "border-warn-700 bg-warn-050 font-bold text-warn-700",
                              !on && "border-line-400 bg-white font-semibold text-muted-600 hover:bg-surface-hover",
                            )}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </span>
                    <PunchLine mark={marks.find((m) => m.employeeId === e.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      type="number" min={0} max={16} step={0.5}
                      className="h-8 w-[90px]"
                      disabled={!can.mark || !d || d.status === "ABSENT"}
                      value={d?.ot ?? 0}
                      onChange={(ev) =>
                        setDraft((s) => ({ ...s, [e.id]: { status: s[e.id]?.status ?? "PRESENT", ot: Number(ev.target.value) } }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------ Punch log --------------------------------- */

const LOG_STATUS: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: "Present", cls: "bg-good-050 text-good-700" },
  HALF_DAY: { label: "Half day", cls: "bg-warn-050 text-warn-700" },
  ABSENT: { label: "Absent", cls: "bg-bad-050 text-bad-600" },
};

function logDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

/**
 * Every check-in and check-out in the range, newest day first — the answer
 * to "did they log in from the app today, and from where".
 */
function LogTab({
  rows, from, to, rangeError, onRange,
}: {
  rows: LogRow[]; from: string; to: string; rangeError: string | null;
  onRange: (f: string, t: string) => void;
}) {
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);
  const [who, setWho] = React.useState("");

  const needle = who.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.name} ${r.code}`.toLowerCase().includes(needle)) : rows;
  const punched = shown.filter((r) => r.checkIn).length;
  const open = shown.filter((r) => r.noCheckOut).length;

  const where = (href: string | null) =>
    href ? <a href={href} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">map</a> : <span className="text-muted-400">no location</span>;

  // Rows are grouped by day so a day's check-ins read as one block.
  const days: Array<{ date: string; rows: LogRow[] }> = [];
  for (const r of shown) {
    const last = days[days.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else days.push({ date: r.date, rows: [r] });
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <Field label="From" className="w-[160px]">
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </Field>
        <Field label="To" className="w-[160px]">
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Button size="md" variant="secondary" onClick={() => onRange(f, t)}>Apply</Button>
        <Field label="Find" className="w-[220px]">
          <Input placeholder="Name or ID" value={who} onChange={(e) => setWho(e.target.value)} />
        </Field>
      </div>

      {rangeError && (
        <div className="mb-3.5">
          <Alert tone="error" title="Range not applied">{rangeError}</Alert>
        </div>
      )}

      <div className="mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {[
          { v: String(shown.length), l: "Attendance rows", cls: "bg-surface-hover text-navy-800 border-line-400" },
          { v: String(punched), l: "App check-ins", cls: "bg-good-050 text-good-700 border-good-050" },
          { v: String(shown.length - punched), l: "Marked by hand", cls: "bg-surface-field text-navy-500 border-line-400" },
          { v: String(open), l: "No check-out", cls: open ? "bg-warn-050 text-warn-700 border-warn-050" : "bg-surface-hover text-navy-800 border-line-400" },
        ].map((k) => (
          <div key={k.l} className={cn("rounded-[11px] border px-3.5 py-3", k.cls)}>
            <p className="num font-display text-[20px] font-bold">{k.v}</p>
            <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-80">{k.l}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Day", "Employee", "Type", "Status", "Check-in", "Check-out", "Hours", "Source"].map((h, i) => (
                <th key={h} className={cn(
                  "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                  i === 6 ? "text-right" : "text-left",
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">
                No check-ins or marks in this range. Punches from the app land here the moment they are made.
              </td></tr>
            ) : days.map((d) => (
              <React.Fragment key={d.date}>
                <tr className="bg-surface-field/60">
                  <td colSpan={8} className="px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                    {logDay(d.date)} · {d.rows.length} {d.rows.length === 1 ? "person" : "people"}
                  </td>
                </tr>
                {d.rows.map((r) => {
                  const st = LOG_STATUS[r.status] ?? { label: r.status, cls: "bg-surface-field text-navy-500" };
                  return (
                    <tr key={r.id} className="border-b border-line-200 last:border-0">
                      <td className="num px-4 py-2.5 text-[11.5px] font-medium text-muted-400">{r.date.slice(8)}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-[12.5px] font-bold text-navy-950">{r.name}</p>
                        <p className="num text-[11px] font-medium text-muted-400">{r.code}</p>
                      </td>
                      <td className="px-4 py-2.5"><span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", typePill(r.employmentType))}>{r.employmentType}</span></td>
                      <td className="px-4 py-2.5"><span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", st.cls)}>{st.label}</span></td>
                      <td className="num px-4 py-2.5 text-[12px] font-semibold text-navy-900">
                        {r.checkIn ? <>{r.checkIn} <span className="text-[11px] font-medium">({where(r.inMap)})</span></> : <span className="text-muted-400">—</span>}
                      </td>
                      <td className="num px-4 py-2.5 text-[12px] font-semibold text-navy-900">
                        {r.checkOut
                          ? <>{r.checkOut} <span className="text-[11px] font-medium">({where(r.outMap)})</span></>
                          : r.noCheckOut
                            ? <span className="font-semibold text-warn-700">no check-out</span>
                            : r.checkIn ? <span className="text-muted-400">on duty</span> : <span className="text-muted-400">—</span>}
                      </td>
                      <td className="num px-4 py-2.5 text-right text-[12px] font-semibold text-navy-900">
                        {r.hours === null ? "—" : r.hours.toFixed(1)}
                        {r.overtimeHours > 0 && <span className="block text-[10.5px] font-medium text-muted-400">+{r.overtimeHours} OT</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[11.5px] font-medium text-navy-500">{r.source}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* --------------------------- Attendance report ----------------------------- */

function ReportTab({
  rows, from, to, rangeError, params, can, onRange,
}: {
  rows: AttendanceSummaryRow[]; from: string; to: string; rangeError: string | null;
  /** The current query, for the export link. */
  params: URLSearchParams;
  can: Record<string, boolean>; onRange: (f: string, t: string) => void;
}) {
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);

  // The export takes the applied range (not unsaved edits) and the employee filters.
  const exportParams = new URLSearchParams({ from, to });
  for (const k of ["q", "type", "designation"]) {
    const v = params.get(k);
    if (v) exportParams.set(k, v);
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <Field label="From" className="w-[160px]">
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </Field>
        <Field label="To" className="w-[160px]">
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Button size="md" variant="secondary" onClick={() => onRange(f, t)}>Apply</Button>
        {can.exportReport && (
          <ExportMenu
            size="md"
            href={(format) => exportHref("/api/hr/attendance/export", format, exportParams)}
            disabled={Boolean(rangeError) || rows.length === 0}
          />
        )}
      </div>

      {rangeError && (
        <div className="mb-3.5">
          <Alert tone="error" title="Range not applied">{rangeError}</Alert>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Employee", "Type", "Present", "Half day", "Absent", "Payable days", "Overtime", "First check-in (avg)", "Last check-out (avg)"].map((h, i) => (
                <th key={h} className={cn(
                  "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                  i >= 2 ? "text-right" : "text-left",
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">
                {ATTENDANCE_EMPTY.title}
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-line-200 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="text-[12.5px] font-bold text-navy-950">
                    {r.name}
                    {isInactive(r.status) && <Badge tone="muted" className="ml-1.5">Left</Badge>}
                  </p>
                  <p className="num text-[11px] font-medium text-muted-400">{r.code}</p>
                </td>
                <td className="px-4 py-2.5"><span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", typePill(r.employmentType))}>{r.employmentType}</span></td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-good-700">{r.present}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-warn-700">{r.half}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-bad-600">{r.absent}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-navy-950">{r.payable}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-medium text-muted-600">{r.overtime}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-medium text-navy-500">{r.firstCheckIn ?? "—"}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-medium text-navy-500">
                  {r.lastCheckOut ?? "—"}
                  {r.noCheckOut > 0 && <span className="block text-[10.5px] font-semibold text-warn-700">{r.noCheckOut} no check-out</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
