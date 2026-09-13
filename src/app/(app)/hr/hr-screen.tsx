"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download, Pencil, Plus, X } from "lucide-react";

import { Badge, Card, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  createEmployeeAction, createEmploymentTypeAction, deleteEmployeeAction,
  deleteEmploymentTypeAction, markAttendanceAction, updateEmployeeAction,
} from "./actions";

interface Employee {
  id: string; code: string; name: string; mobile: string; altContact: string | null;
  aadhaar: string | null; pan: string | null; address: string | null;
  employmentTypeId: string; employmentType: string;
  designationId: string | null; designation: string | null;
  documents: Array<{ id: string; kind: string; fileName: string; fileSize: number }>;
}
interface TypeRow { id: string; name: string; count: number; canDelete: boolean }
interface Mark { employeeId: string; status: string; overtimeHours: number }
interface ReportRow { employeeId: string; status: string; days: number; overtime: number }

/** The design's three marks, with its own colours. */
const MARKS = [
  { key: "PRESENT", short: "P", label: "Present", tone: "good" as const },
  { key: "ABSENT", short: "A", label: "Absent", tone: "bad" as const },
  { key: "HALF_DAY", short: "H", label: "Half day", tone: "warn" as const },
];

const TABS = [
  { key: "staff", label: "Employees" },
  { key: "mark", label: "Mark Attendance" },
  { key: "report", label: "Attendance Report" },
];

export function HrScreen({
  tab, date, from, to, employees, employmentTypes, designations, dayMarks, report, can,
}: {
  tab: string; date: string; from: string; to: string;
  employees: Employee[]; employmentTypes: TypeRow[];
  designations: Array<{ id: string; name: string }>;
  dayMarks: Mark[]; report: ReportRow[];
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);
  const [editing, setEditing] = React.useState<Employee | "new" | null>(null);
  const [removing, setRemoving] = React.useState<Employee | null>(null);
  const [newType, setNewType] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function setParam(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") q.delete(k); else q.set(k, v);
    }
    router.push(`${pathname}?${q.toString()}`);
  }

  const visibleTabs = TABS.filter(
    (t) => (t.key !== "mark" || can.viewAttendance) && (t.key !== "report" || can.report),
  );
  const active = visibleTabs.some((t) => t.key === tab) ? tab : (visibleTabs[0]?.key ?? "staff");

  function flash(message: string) {
    toast(message);
    router.refresh();
  }

  async function addType() {
    setBusy(true);
    const res = await createEmploymentTypeAction(newType);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNewType("");
    flash("Employment type added");
  }

  async function removeType(t: TypeRow) {
    const res = await deleteEmploymentTypeAction(t.id);
    if (!res.ok) { setError(res.error); return; }
    flash(`${t.name} removed`);
  }

  async function removeEmployee() {
    if (!removing) return;
    setBusy(true);
    const res = await deleteEmployeeAction(removing.id);
    setBusy(false);
    if (!res.ok) { setError(res.error); setRemoving(null); return; }
    setRemoving(null);
    flash(`${removing.name} removed`);
  }

  return (
    <div className="animate-fade-up">
      {/* Tabs, underlined as the design draws them */}
      <div className="mb-3.5 flex flex-wrap items-center gap-4 border-b border-line-300">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParam({ tab: t.key })}
            className={cn(
              "border-b-[2.5px] px-1 py-2.5 text-[13px] transition-colors",
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
          employmentTypes={employmentTypes}
          designations={designations}
          params={params}
          can={can}
          newType={newType}
          busy={busy}
          onNewType={setNewType}
          onAddType={addType}
          onRemoveType={removeType}
          onEdit={setEditing}
          onRemove={setRemoving}
        />
      )}

      {active === "mark" && can.viewAttendance && (
        <MarkTab
          employees={employees}
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
          employees={employees}
          rows={report}
          from={from}
          to={to}
          can={can}
          onRange={(f, t) => setParam({ from: f, to: t })}
        />
      )}

      {editing && (
        <EmployeeForm
          employee={editing === "new" ? null : editing}
          employmentTypes={employmentTypes}
          designations={designations}
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
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={removeEmployee} loading={busy}>Delete</Button>
          </>
        }
      >
        <p className="text-[12.5px] font-medium text-muted-600">
          {removing?.name} will be removed from the user master. Anyone who already has
          attendance recorded cannot be deleted — the record has to stay.
        </p>
      </Modal>
    </div>
  );
}

/* -------------------------------- Employees -------------------------------- */

function StaffTab({
  employees, employmentTypes, designations, params, can, newType, busy,
  onNewType, onAddType, onRemoveType, onEdit, onRemove,
}: {
  employees: Employee[]; employmentTypes: TypeRow[];
  designations: Array<{ id: string; name: string }>;
  /** The current query, for the export link. */
  params: URLSearchParams;
  can: Record<string, boolean>; newType: string; busy: boolean;
  onNewType: (v: string) => void;
  onAddType: () => void; onRemoveType: (t: TypeRow) => void;
  onEdit: (e: Employee | "new") => void; onRemove: (e: Employee) => void;
}) {
  // The export carries only the employee filters, not the attendance tabs' dates.
  const exportParams = new URLSearchParams();
  for (const k of ["q", "type", "designation"]) {
    const v = params.get(k);
    if (v) exportParams.set(k, v);
  }

  return (
    <div>
      <ListToolbar
        className="mb-3.5"
        searchPlaceholder="Search name, code or mobile…"
        filters={[
          {
            name: "type",
            label: "Employment type",
            allLabel: "All types",
            options: employmentTypes.map((t) => ({ value: t.id, label: t.name })),
          },
          {
            name: "designation",
            label: "Designation",
            allLabel: "All designations",
            options: designations.map((d) => ({ value: d.id, label: d.name })),
          },
        ]}
      >
        <span className="text-[11.5px] font-semibold text-muted-600">
          {employees.length} employee{employees.length === 1 ? "" : "s"} on record
        </span>
        {can.exportEmployees && (
          <ExportMenu
            href={(format) => exportHref("/api/hr/employees/export", format, exportParams)}
            disabled={employees.length === 0}
          />
        )}
        {can.create && (
          <Button size="sm" onClick={() => onEdit("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New employee
          </Button>
        )}
      </ListToolbar>

      {/* Employment types — configurable, as the design's chips */}
      <Card className="mb-3.5 px-4 py-3.5">
        <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Employment types</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {employmentTypes.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-field px-3 py-1.5 text-[11.5px] font-bold text-navy-600 ring-1 ring-inset ring-line-400"
            >
              {t.name}
              <span className="num opacity-60">{t.count}</span>
              {can.deleteTypes && t.canDelete && (
                <button
                  type="button"
                  title="Remove"
                  onClick={() => onRemoveType(t)}
                  className="grid h-[15px] w-[15px] place-items-center rounded-full text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          {can.manageTypes && (
            <span className="inline-flex items-center gap-1.5">
              <Input
                value={newType}
                onChange={(e) => onNewType(e.target.value)}
                placeholder="Add a type"
                className="h-8 w-[150px] text-[11.5px]"
              />
              <Button size="xs" variant="secondary" onClick={onAddType} loading={busy} disabled={!newType.trim()}>
                + Add
              </Button>
            </span>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Employee", "Type", "Designation", "Mobile", "Aadhaar", "Documents", ""].map((h, i) => (
                <th
                  key={h || i}
                  className={cn(
                    "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                    i === 6 ? "text-right" : "text-left",
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
                  Nobody on record yet.
                </td>
              </tr>
            ) : employees.map((e) => (
              <tr key={e.id} className="border-b border-line-200 transition-colors last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-3">
                  <p className="text-[12.5px] font-bold text-navy-950">{e.name}</p>
                  <p className="num text-[11px] font-medium text-muted-400">{e.code}</p>
                </td>
                <td className="px-4 py-3"><Badge tone="slate">{e.employmentType}</Badge></td>
                <td className="px-4 py-3 text-[12px] font-medium text-muted-600">{e.designation ?? "—"}</td>
                <td className="num px-4 py-3 text-[12px] font-semibold text-navy-900">{e.mobile}</td>
                <td className="num px-4 py-3 text-[12px] font-medium text-muted-600">{e.aadhaar ?? "—"}</td>
                <td className="px-4 py-3">
                  {e.documents.length === 0
                    ? <span className="text-[11.5px] font-medium text-muted-400">None</span>
                    : <span className="flex flex-wrap gap-1">
                        {e.documents.map((d) => <Badge key={d.id} tone="muted">{d.kind}</Badge>)}
                      </span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex gap-1">
                    {can.update && (
                      <button
                        type="button" title="Edit" onClick={() => onEdit(e)}
                        className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-surface-hover hover:text-navy-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {can.remove && (
                      <button
                        type="button" title="Delete" onClick={() => onRemove(e)}
                        className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
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

function MarkTab({
  employees, date, marks, can, onDate, onDone, onError,
}: {
  employees: Employee[]; date: string; marks: Mark[]; can: Record<string, boolean>;
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
                Add employees before marking attendance.
              </td></tr>
            ) : employees.map((e) => {
              const d = draft[e.id];
              return (
                <tr key={e.id} className="border-b border-line-200 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-[12.5px] font-bold text-navy-950">{e.name}</p>
                    <p className="text-[11px] font-medium text-muted-400">{e.designation ?? e.code}</p>
                  </td>
                  <td className="px-4 py-2.5"><Badge tone="slate">{e.employmentType}</Badge></td>
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
  employees, rows, from, to, can, onRange,
}: {
  employees: Employee[]; rows: ReportRow[]; from: string; to: string;
  can: Record<string, boolean>; onRange: (f: string, t: string) => void;
}) {
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);

  const byEmployee = employees.map((e) => {
    const mine = rows.filter((r) => r.employeeId === e.id);
    const get = (s: string) => mine.find((r) => r.status === s)?.days ?? 0;
    const present = get("PRESENT");
    const half = get("HALF_DAY");
    return {
      ...e,
      present,
      half,
      absent: get("ABSENT"),
      overtime: mine.reduce((s, r) => s + r.overtime, 0),
      payable: present + half * 0.5,
    };
  });

  function exportCsv() {
    const header = ["Code", "Employee", "Type", "Designation", "Present", "Half day", "Absent", "Payable days", "Overtime (hrs)"];
    const lines = byEmployee.map((r) =>
      [r.code, r.name, r.employmentType, r.designation ?? "", r.present, r.half, r.absent, r.payable, r.overtime]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${f}_to_${t}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <Button size="md" variant="ghost" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Employee", "Type", "Present", "Half day", "Absent", "Payable days", "Overtime"].map((h, i) => (
                <th key={h} className={cn(
                  "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                  i >= 2 ? "text-right" : "text-left",
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byEmployee.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">
                Nothing recorded in this range.
              </td></tr>
            ) : byEmployee.map((r) => (
              <tr key={r.id} className="border-b border-line-200 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="text-[12.5px] font-bold text-navy-950">{r.name}</p>
                  <p className="num text-[11px] font-medium text-muted-400">{r.code}</p>
                </td>
                <td className="px-4 py-2.5"><Badge tone="slate">{r.employmentType}</Badge></td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-good-700">{r.present}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-warn-700">{r.half}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-bad-600">{r.absent}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-bold text-navy-950">{r.payable}</td>
                <td className="num px-4 py-2.5 text-right text-[12px] font-medium text-muted-600">{r.overtime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------ Employee form ------------------------------ */

function EmployeeForm({
  employee, employmentTypes, designations, onClose, onSaved,
}: {
  employee: Employee | null;
  employmentTypes: TypeRow[];
  designations: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = employee
      ? await updateEmployeeAction(employee.id, fd)
      : await createEmployeeAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(employee ? `${fd.get("name")} updated` : `${fd.get("name")} added to the user master`);
  }

  return (
    <Modal open onClose={onClose} title={employee ? "Edit employee" : "New employee"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>}

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <Field label="Name" required>
            <Input name="name" defaultValue={employee?.name} required autoFocus />
          </Field>
          <Field label="Employment type" required>
            <Select name="employmentTypeId" defaultValue={employee?.employmentTypeId} required>
              {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Designation">
            <Select name="designationId" defaultValue={employee?.designationId ?? ""}>
              <option value="">Select designation…</option>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Mobile" required>
            <Input name="mobile" defaultValue={employee?.mobile} placeholder="+91 98450 66120" required />
          </Field>
          <Field label="Aadhaar" required hint="Mandatory, as in the design.">
            <Input name="aadhaar" defaultValue={employee?.aadhaar ?? ""} placeholder="4821 7734 9012" required />
          </Field>
          <Field label="PAN">
            <Input name="pan" defaultValue={employee?.pan ?? ""} placeholder="ABCDE1234F" className="uppercase" />
          </Field>
          <Field label="Alternate contact">
            <Input name="altContact" defaultValue={employee?.altContact ?? ""} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input name="address" defaultValue={employee?.address ?? ""} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{employee ? "Save changes" : "Create employee"}</Button>
        </div>
      </form>
    </Modal>
  );
}
