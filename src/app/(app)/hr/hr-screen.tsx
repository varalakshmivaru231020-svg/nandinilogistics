"use client";

import * as React from "react";

import { ATTENDANCE_EMPTY, ATTENDANCE_MARK_EMPTY, EMPLOYEE_EMPTY } from "@/lib/hr/list-display";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { useToast } from "@/components/ui/toast";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { COUNTRY_CODES } from "@/lib/forms/dial-codes";
import { cn } from "@/lib/utils";
import { uploadProblem } from "@/lib/upload-rules";
import type { AttendanceSummaryRow } from "@/lib/hr/attendance-report";
import { isInactive, statusLabel } from "@/lib/hr/employee-status";
import { isInternalStaffType, isRiderType, ONBOARDING_LABEL, ONBOARDING_TONE, RIDER_DOC_KINDS, type OnboardingStatus } from "@/lib/riders/onboarding";
import {
  createEmployeeAction, deleteEmployeeAction,
  markAttendanceAction, setEmployeeStatusAction, updateEmployeeAction,
} from "./actions";

/** The design writes an attached file's weight in kilobytes: "740 KB". */
function fileSize(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Employee {
  id: string; code: string; name: string; mobile: string; altContact: string | null;
  aadhaar: string | null; pan: string | null; address: string | null;
  employmentTypeId: string; employmentType: string;
  designationId: string | null; designation: string | null;
  status: string;
  onboardingStatus: OnboardingStatus;
  /** A new record waits for a Team Leader or Super Admin. */
  approval: "APPROVED" | "PENDING" | "REJECTED";
  emergencyMobileFamily: string | null; emergencyMobileFriend: string | null;
  bankAccountNo: string | null; bankHolderName: string | null; bankIfsc: string | null; bankName: string | null;
  pfNumber: string | null; drivingLicence: string | null; insuranceNumber: string | null;
  monthlySalary: number | null; joinedOn: string | null;
  companyIds: string[]; companies: string[];
  /** Whether a photograph is on file, so the row and the form can show it. */
  hasPhoto: boolean;
  referredById?: string | null;
  referralApproval?: string;
  documents: Array<{ id: string; kind: string; fileName: string; fileSize: number }>;
}
interface TypeRow { id: string; name: string; count: number; canDelete: boolean }
/** Someone who can be picked as "Referred by" — an active, accepted rider. */
export interface Referrer { id: string; name: string; code: string; referralCode: string | null }

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

/** The design's three marks, with its own colours. */
const MARKS = [
  { key: "PRESENT", short: "P", label: "Present", tone: "good" as const },
  { key: "ABSENT", short: "A", label: "Absent", tone: "bad" as const },
  { key: "HALF_DAY", short: "H", label: "Half day", tone: "warn" as const },
];

const TABS = [
  { key: "staff", label: "Riders & Staff" },
  { key: "mark", label: "Mark Attendance" },
  { key: "report", label: "Attendance Report" },
];

export function HrScreen({
  tabs, newLabel, defaultTypeId, referrers = [],
  tab, date, from, to, rangeError, employees, markable, employmentTypes, designations, companies, dayMarks, report, can,
}: {
  /** Which tabs this sidebar entry shows — the list, or mark and report. */
  tabs: string[];
  /** "+ New rider" or "+ New staff member". */
  newLabel: string;
  /** The employment type a new record starts on. */
  defaultTypeId: string | null;
  referrers?: Referrer[];
  tab: string; date: string; from: string; to: string;
  /** Why the report range was refused, or null. */
  rangeError: string | null;
  employees: Employee[]; markable: MarkRow[]; employmentTypes: TypeRow[];
  designations: Array<{ id: string; name: string }>;
  /** The active client companies a rider can be deployed to. */
  companies: Array<{ id: string; name: string }>;
  dayMarks: Mark[]; report: AttendanceSummaryRow[];
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);
  const [editing, setEditing] = React.useState<Employee | "new" | null>(null);
  const [removing, setRemoving] = React.useState<Employee | null>(null);
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
          newLabel={newLabel}
          onEdit={setEditing}
          onRemove={setRemoving}
          onStatus={openStatus}
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

      {editing && (
        <EmployeeForm
          employee={editing === "new" ? null : editing}
          // Internal Staff and Team Leader records are Super Admin's to add;
          // an existing one keeps its own type in the list.
          employmentTypes={can.createStaff ? employmentTypes : employmentTypes.filter((t) => {
            const n = t.name.trim().toLowerCase();
            const staff = n === "internal staff" || n === "team leader";
            return !staff || (editing !== "new" && editing?.employmentTypeId === t.id);
          })}
          defaultTypeId={defaultTypeId}
          referrers={referrers}
          designations={designations}
          companies={companies}
          canManageCompanies={Boolean(can.manageCompanies)}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); flash(m); }}
        />
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
  employees, can, newLabel, onEdit, onRemove, onStatus,
}: {
  employees: Employee[];
  newLabel: string;
  can: Record<string, boolean>;
  onEdit: (e: Employee | "new") => void; onRemove: (e: Employee) => void;
  onStatus: (e: Employee) => void;
}) {
  return (
    <div>
      {/* The design heads this tab with the count and one button, 13px above the table. */}
      <div className="mb-[13px] flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-600">
          {employees.length} {employees.length === 1 ? "person" : "people"} on record
        </span>
        {can.create && (
          <Button size="md" onClick={() => onEdit("new")}>
            {newLabel}
          </Button>
        )}
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
                <td className="px-4 py-3 text-[12px] font-medium text-navy-500">{e.address ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {isInactive(e.status) && can.update ? (
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
                    {can.update && (
                      <button
                        type="button"
                        onClick={() => onEdit(e)}
                        className="rounded-[7px] border border-line-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-navy-500 hover:border-brand-500 hover:text-brand-700"
                      >
                        Edit
                      </button>
                    )}
                    {can.remove && (
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

/* ------------------------------ Employee form ------------------------------ */

export function EmployeeForm({
  employee, employmentTypes, defaultTypeId = null, referrers = [], designations, companies, canManageCompanies, onClose, onSaved,
}: {
  employee: Employee | null;
  employmentTypes: Array<{ id: string; name: string }>;
  defaultTypeId?: string | null;
  referrers?: Referrer[];
  designations: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  canManageCompanies: boolean;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  // Which particulars the form asks for follows the employment type picked:
  // a rider has emergency numbers, a bank account and companies; internal
  // staff a monthly salary.
  const [pickedTypeId, setTypeId] = React.useState(employee?.employmentTypeId ?? defaultTypeId ?? employmentTypes[0]?.id ?? "");
  // The default may be a type this person cannot add (Internal Staff, for a
  // Team Leader); fall back to the first one they can.
  const typeId = employmentTypes.some((t) => t.id === pickedTypeId) ? pickedTypeId : (employmentTypes[0]?.id ?? "");
  const typeName = employmentTypes.find((t) => t.id === typeId)?.name ?? "";
  const rider = isRiderType(typeName);
  const internal = isInternalStaffType(typeName);
  const [error, setError] = React.useState<string | null>(null);
  const [photoName, setPhotoName] = React.useState<string | null>(null);
  // A local preview of the picked file, so the square shows the face being uploaded.
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [docs, setDocs] = React.useState<Record<string, { name: string; size: string } | null>>({});
  /** The live file inputs, so Remove can clear the one it is undoing. */
  const docInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    // The design asks for the country code beside the number; the record keeps
    // the two together.
    const dial = String(fd.get("mobileCode") ?? "").split(" ")[0];
    const typed = String(fd.get("mobile") ?? "").trim();
    if (dial && typed && !typed.startsWith("+")) fd.set("mobile", `${dial} ${typed}`);
    fd.delete("mobileCode");
    const res = employee
      ? await updateEmployeeAction(employee.id, fd)
      : await createEmployeeAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const held = res.data?.pending;
    onSaved(employee
      ? (held ? `Changes to ${fd.get("name")} sent for approval` : `${fd.get("name")} updated`)
      : (held ? `${fd.get("name")} added — waiting for Team Leader / Super Admin approval` : `${fd.get("name")} added to the user master`));
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={employee ? "Edit employee" : "New employee"}
      description="Name, mobile, photo and Aadhaar are mandatory"
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="employee-form" loading={busy} className="px-[18px]">
            {employee ? "Save changes" : "Create employee"}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-3.5">
        {error && <p className="rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>}

        <div className="flex flex-wrap items-start gap-4">
          {/*
            Editing someone who already has a photograph shows that photograph,
            so the square says what is on file rather than inviting an upload
            that has already happened. Picking a new file replaces it.
          */}
          <label
            className={cn(
              "relative flex h-[84px] w-[84px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[12px] border-[1.5px] text-center text-[10px] font-semibold transition-colors",
              photoName
                ? "border-solid border-good-400 bg-good-050 text-good-700"
                : "border-dashed border-muted-200 bg-surface-sunken text-muted-400 hover:border-brand-500",
            )}
          >
            {photoPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Photo to upload" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-navy-950/60 py-[3px] text-[9px] font-bold text-white">
                  Change
                </span>
              </>
            ) : employee?.hasPhoto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/hr/photo/${employee.id}`}
                  alt={employee.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-navy-950/60 py-[3px] text-[9px] font-bold text-white">
                  Change
                </span>
              </>
            ) : (
              <>
                <span className="text-[20px]">📷</span>
                <span className="px-1.5">{photoName ? "✓ Photo added" : "Upload photo"}</span>
              </>
            )}
            <input
              type="file"
              name="photo"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                const problem = f ? uploadProblem([f]) : null;
                if (photoPreview) URL.revokeObjectURL(photoPreview);
                if (problem) { setError(problem); e.target.value = ""; setPhotoName(null); setPhotoPreview(null); return; }
                setError(null);
                setPhotoName(f?.name ?? null);
                setPhotoPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>

          <div className="grid min-w-[240px] flex-1 gap-3">
            <Field label="Type of employment" required>
              {employmentTypes.length === 1 ? (
                // One type to choose from: say so rather than offer a one-item list.
                <>
                  <input type="hidden" name="employmentTypeId" value={typeId} />
                  <div className="flex h-[44px] items-center rounded-[10px] border border-line-400 bg-surface-sunken px-3.5 text-[13.5px] font-semibold text-navy-900">
                    {employmentTypes[0].name}
                  </div>
                </>
              ) : (
                <Select name="employmentTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className="font-semibold" required>
                  {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Name" required>
              <Input name="name" defaultValue={employee?.name} placeholder="Full name" required autoFocus />
            </Field>
            <Field label="Designation">
              <Select name="designationId" defaultValue={employee?.designationId ?? ""} className="font-semibold">
                <option value="">Select designation…</option>
                {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <Field label="Mobile number" required>
          <div className="flex gap-2">
            <Select
              name="mobileCode"
              defaultValue="+91 India"
              aria-label="Country code"
              className="w-[132px] shrink-0 px-2 text-[12px]"
            >
              {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input name="mobile" defaultValue={employee?.mobile} placeholder="98765 43210" required />
          </div>
        </Field>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <Field label="Aadhaar number" required>
            <Input name="aadhaar" defaultValue={employee?.aadhaar ?? ""} placeholder="1234 5678 9012" required />
          </Field>
          <Field label="PAN">
            <Input name="pan" defaultValue={employee?.pan ?? ""} placeholder="ABCDE1234F" className="uppercase" />
          </Field>
          <Field label="Alternate number">
            <Input name="altContact" defaultValue={employee?.altContact ?? ""} placeholder="+91 90000 00000" />
          </Field>
        </div>

        <Field label="Address">
          <Textarea name="address" defaultValue={employee?.address ?? ""} placeholder="House, area, city" className="min-h-[74px]" />
        </Field>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <Field label="Joining date">
            <Input name="joinedOn" type="date" defaultValue={employee?.joinedOn ?? ""} />
          </Field>
          <Field label="Driving licence">
            <Input name="drivingLicence" defaultValue={employee?.drivingLicence ?? ""} placeholder="KA01 20230001234" className="uppercase" />
          </Field>
          <Field label="PF number">
            <Input name="pfNumber" defaultValue={employee?.pfNumber ?? ""} placeholder="Optional" />
          </Field>
          <Field label="Insurance number">
            <Input name="insuranceNumber" defaultValue={employee?.insuranceNumber ?? ""} placeholder="Shown on the ID card" />
          </Field>
          {internal && (
            <Field label="Monthly salary (₹)">
              <Input name="monthlySalary" type="number" min={0} step="1" defaultValue={employee?.monthlySalary ?? ""} placeholder="e.g. 18000" />
            </Field>
          )}
        </div>

        {rider && (
          <Field label="Referred by" hint="Optional — search a rider by name or Rider ID, or type their referral code">
            <Input
              name="referredById"
              list="referrer-options"
              defaultValue={
                employee?.referredById
                  ? (referrers.find((r) => r.id === employee.referredById)?.code ?? employee.referredById)
                  : ""
              }
              placeholder="e.g. NL004 or REF-NL004"
              autoComplete="off"
            />
            <datalist id="referrer-options">
              {referrers.filter((r) => r.id !== employee?.id).map((r) => (
                <option key={r.id} value={r.code}>{`${r.name}${r.referralCode ? ` · ${r.referralCode}` : ""}`}</option>
              ))}
            </datalist>
            {employee?.referralApproval === "PENDING" && (
              <p className="mt-1 text-[11px] font-semibold text-warn-700">Referral pending approval</p>
            )}
          </Field>
        )}

        {rider && (
          <>
            <div className="!mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Emergency contacts · mandatory for riders</p>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                <Field label="Father / mother mobile" required>
                  <Input name="emergencyMobileFamily" defaultValue={employee?.emergencyMobileFamily ?? ""} placeholder="98765 43210" />
                </Field>
                <Field label="Friend mobile" required>
                  <Input name="emergencyMobileFriend" defaultValue={employee?.emergencyMobileFriend ?? ""} placeholder="98765 43210" />
                </Field>
              </div>
            </div>

            <div className="!mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Bank details · mandatory for riders</p>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                <Field label="Account number" required>
                  <Input name="bankAccountNo" defaultValue={employee?.bankAccountNo ?? ""} placeholder="Account number" />
                </Field>
                <Field label="Account holder name" required>
                  <Input name="bankHolderName" defaultValue={employee?.bankHolderName ?? ""} placeholder="As on the passbook" />
                </Field>
                <Field label="IFSC code" required>
                  <Input name="bankIfsc" defaultValue={employee?.bankIfsc ?? ""} placeholder="HDFC0001234" className="uppercase" />
                </Field>
                <Field label="Bank name" required>
                  <Input name="bankName" defaultValue={employee?.bankName ?? ""} placeholder="Bank" />
                </Field>
              </div>
            </div>

            <Field label="Companies deployed to" required>
              <select
                name="companyIds"
                multiple
                defaultValue={employee?.companyIds ?? []}
                disabled={Boolean(employee) && !canManageCompanies}
                className="min-h-[88px] w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12.5px] font-medium text-navy-900 focus:border-brand-500 focus:bg-white focus:outline-none disabled:opacity-60"
              >
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] font-medium text-muted-400">Hold Ctrl (or Cmd) to pick more than one.</p>
            </Field>
          </>
        )}

        <div className="!mt-4">
          <p className="mb-1 text-[11px] font-semibold text-muted-600">
            Attachments <span className="font-medium text-muted-400">· optional</span>
          </p>
          <p className="mb-[9px] text-[11px] font-medium text-muted-400">Aadhaar front and back are mandatory for riders · PAN, passbook and driving licence optional</p>
          <div>
            {RIDER_DOC_KINDS.map((kind) => {
              // What this row shows: the file just picked, or failing that the
              // copy already on the record. Derived, so removing a new pick
              // falls back to the stored one rather than showing nothing.
              const onFile = employee?.documents.find((d) => d.kind === kind);
              const doc =
                docs[kind] ??
                (onFile ? { name: onFile.fileName, size: fileSize(onFile.fileSize) } : null);
              return (
                <div
                  key={kind}
                  className={cn(
                    "mb-2 flex items-center gap-2.5 rounded-[10px] border px-3 py-[11px]",
                    doc
                      ? "border-solid border-line-300 bg-surface-tint"
                      : "border-dashed border-muted-200 bg-surface-sunken",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-[5px] px-1.5 py-1 text-[8.5px] font-extrabold tracking-[.05em] text-white",
                      doc ? "bg-bad-700" : "bg-muted-250",
                    )}
                  >
                    PDF
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-navy-900">{kind}</span>
                    {doc && (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-400">
                        {doc.name} · {doc.size}
                      </span>
                    )}
                  </span>
                  {/*
                   * The input stays mounted whether or not a file has been
                   * chosen. It used to live inside the Attach label and be
                   * swapped for the Remove button, which unmounted it — and an
                   * input that is not in the form when it submits contributes
                   * no file. Every Aadhaar and PAN copy anyone attached was
                   * silently dropped, which is why no employee had documents.
                   */}
                  <input
                    ref={(el) => { docInputs.current[kind] = el; }}
                    id={`doc-${kind.replace(/\s+/g, "-")}`}
                    type="file"
                    name={`doc:${kind}`}
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      const problem = f ? uploadProblem([f]) : null;
                      if (problem) {
                        setError(problem);
                        e.target.value = "";
                        setDocs((d) => {
                          const next = { ...d };
                          delete next[kind];
                          return next;
                        });
                        return;
                      }
                      setError(null);
                      setDocs((d) => {
                        const next = { ...d };
                        if (f) next[kind] = { name: f.name, size: fileSize(f.size) };
                        else delete next[kind];
                        return next;
                      });
                    }}
                  />
                  {/*
                   * Remove undoes a file picked just now. A copy already on the
                   * record is replaced, not removed — taking an identity
                   * document off a staff record is not something a half-filled
                   * form should do on the way past.
                   */}
                  {docs[kind] ? (
                    <button
                      type="button"
                      onClick={() => {
                        const input = docInputs.current[kind];
                        if (input) input.value = "";
                        setDocs((d) => {
                          const next = { ...d };
                          delete next[kind];
                          return next;
                        });
                      }}
                      className="shrink-0 cursor-pointer rounded-[7px] border border-bad-100 bg-bad-050 px-[11px] py-[5px] text-[10.5px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
                    >
                      Remove
                    </button>
                  ) : (
                    <label
                      htmlFor={`doc-${kind.replace(/\s+/g, "-")}`}
                      className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 bg-white px-3 py-[5px] text-[10.5px] font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
                    >
                      {doc ? "↑ Replace" : "↑ Attach"}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </form>
    </Drawer>
  );
}
