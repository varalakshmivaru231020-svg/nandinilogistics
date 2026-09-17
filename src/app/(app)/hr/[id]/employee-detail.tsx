"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { deleteEmployeeAction } from "../actions";

export interface AttendanceDay {
  /** "01" — the day of the month, as the calendar cell shows it. */
  day: string;
  /** P / H / A, or "·" when nothing was marked. */
  mark: string;
  status: "PRESENT" | "HALF_DAY" | "ABSENT" | null;
  tip: string;
}

export interface AttendanceRow {
  id: string; date: string; status: string; ot: string; work: string;
  tone: "good" | "warn" | "bad";
}

const CELL_TONE: Record<string, string> = {
  PRESENT: "border-good-200 bg-good-050 text-good-700",
  HALF_DAY: "border-amber-200 bg-warn-050 text-warn-700",
  ABSENT: "border-bad-100 bg-bad-050 text-bad-700",
};

const ROW_TONE = {
  good: "bg-good-050 text-good-700",
  warn: "bg-warn-050 text-warn-700",
  bad: "bg-bad-050 text-bad-700",
} as const;

/**
 * The design's employee record: the person on the left, and everything that
 * has been marked against them on the right — documents, the range's figures,
 * the calendar and the log.
 */
export function EmployeeDetail({
  employee, documents, stats, calendar, log, range, can,
}: {
  employee: {
    id: string; name: string; initials: string; avatar: string;
    type: string; designation: string;
    fields: Array<{ k: string; v: string }>;
  };
  documents: Array<{ id: string; kind: string; fileName: string; size: string }>;
  stats: { present: string; half: string; absent: string; ot: string; pay: string };
  calendar: AttendanceDay[];
  log: AttendanceRow[];
  range: { from: string; to: string; label: string; marked: string };
  can: { update: boolean; delete: boolean; export: boolean; viewAttendance: boolean };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function setRange(key: "from" | "to", value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set(key, value);
    router.replace(`/hr/${employee.id}?${params.toString()}`);
  }

  async function remove() {
    setBusy(true);
    const res = await deleteEmployeeAction(employee.id);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/hr");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Link
          href="/hr"
          className="rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
        >
          ← All employees
        </Link>
        {can.viewAttendance && (
          <>
            <span className="text-[11.5px] font-semibold text-muted-500">From</span>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange("from", e.target.value)}
              className="rounded-[9px] border border-line-400 bg-white px-3 py-2 text-[12px] font-medium text-navy-900"
            />
            <span className="text-[11.5px] font-semibold text-muted-500">To</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange("to", e.target.value)}
              className="rounded-[9px] border border-line-400 bg-white px-3 py-2 text-[12px] font-medium text-navy-900"
            />
          </>
        )}
        <div className="flex-1" />
        {can.export && (
          <a
            href={`/api/hr/employees/export?format=csv&q=${encodeURIComponent(employee.name)}`}
            className="rounded-[9px] border border-line-400 bg-white px-4 py-2.5 text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
          >
            ↑ Export
          </a>
        )}
        {can.update && (
          <Link
            href={`/hr?edit=${employee.id}`}
            className="rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
          >
            ✎ Edit
          </Link>
        )}
        {can.delete && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="cursor-pointer rounded-[9px] border border-bad-100 bg-bad-050 px-4 py-2.5 text-[12.5px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
          >
            Delete
          </button>
        )}
      </div>

      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid gap-3.5 lg:[grid-template-columns:330px_1fr]">
        <div className="space-y-3.5">
          <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px] text-center">
            <span
              className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-[18px] font-display text-[46px] font-bold text-white"
              style={{ background: employee.avatar }}
            >
              {employee.initials}
            </span>
            <div className="mt-3.5 font-display text-[16px] font-bold text-navy-950">{employee.name}</div>
            <div className="mt-0.5 text-[12px] font-semibold text-brand-700">{employee.designation}</div>
            <div className="mt-2">
              <span className="rounded-full bg-good-050 px-[10px] py-[5px] text-[10.5px] font-bold text-good-700">
                {employee.type}
              </span>
            </div>
          </div>

          <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Details</div>
            {employee.fields.map((f) => (
              <div key={f.k} className="border-b border-line-100 py-[9px] last:border-0">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">{f.k}</div>
                <div className="mt-0.5 text-[12.5px] font-semibold text-navy-900">{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3.5">
          <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
              Documents · {documents.length} {documents.length === 1 ? "document" : "documents"}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 rounded-[10px] border border-line-300 bg-surface-sunken px-3 py-2.5"
                >
                  <span className="rounded-[5px] bg-bad-700 px-1.5 py-1 text-[8px] font-extrabold text-white">PDF</span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-navy-900">{d.kind}</div>
                    <div className="text-[11px] font-medium text-muted-400">{d.fileName} · {d.size}</div>
                  </div>
                  <a
                    href={`/api/hr/documents/${d.id}`}
                    className="rounded-[7px] bg-brand-500 px-[11px] py-1.5 text-[10.5px] font-bold text-white transition-colors hover:bg-brand-600"
                  >
                    View
                  </a>
                </div>
              ))}
              {documents.length === 0 && (
                <div className="py-2 text-[12px] font-medium text-muted-400">
                  No documents on file for this employee.
                </div>
              )}
            </div>
          </div>

          {can.viewAttendance && (
            <>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                {[
                  { v: stats.present, l: "Present", cls: "border-good-200 bg-good-050 text-good-700" },
                  { v: stats.half, l: "Half day", cls: "border-amber-200 bg-warn-050 text-warn-700" },
                  { v: stats.absent, l: "Absent", cls: "border-bad-100 bg-bad-050 text-bad-700" },
                  { v: stats.ot, l: "Total OT", cls: "border-line-400 bg-white text-navy-800" },
                  { v: stats.pay, l: "Pay days", cls: "border-navy-950 bg-navy-950 text-white" },
                ].map((s) => (
                  <div key={s.l} className={cn("rounded-[11px] border px-3.5 py-3", s.cls)}>
                    <div className="font-display text-[20px] font-extrabold">{s.v}</div>
                    <div className="mt-0.5 text-[11.5px] font-semibold opacity-80">{s.l}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
                    Attendance calendar · {range.label}
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10.5px] font-semibold text-muted-500">
                    {[
                      ["Present", "bg-good-050 border-good-200"],
                      ["Half day", "bg-warn-050 border-amber-200"],
                      ["Absent", "bg-bad-050 border-bad-100"],
                      ["Not marked", "bg-surface-sunken border-line-200"],
                    ].map(([l, cls]) => (
                      <span key={l} className="flex items-center gap-1.5">
                        <span className={cn("h-2.5 w-2.5 rounded-[3px] border", cls)} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(44px,1fr))]">
                  {calendar.map((d, i) => (
                    <div
                      key={i}
                      title={d.tip}
                      className={cn(
                        "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[8px] border text-[11px] font-bold",
                        d.status ? CELL_TONE[d.status] : "border-line-200 bg-surface-sunken text-[#C0C5DC]",
                      )}
                    >
                      <span>{d.day}</span>
                      <span>{d.mark}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11.5px] font-medium text-muted-600">
                  {range.marked} · hover a day for status, OT and work done
                </div>
              </div>

              <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
                <div className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
                  Attendance log
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Date", "Status", "OT", "Work done"].map((h) => (
                        <th
                          key={h}
                          className="border-y border-line-300 bg-surface-sunken px-5 py-[11px] text-left text-[10px] font-bold uppercase tracking-[.08em] text-muted-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-tint">
                        <td className="border-b border-line-150 px-5 py-3 text-[12px] font-semibold text-navy-900">{r.date}</td>
                        <td className="border-b border-line-150 px-5 py-3">
                          <span className={cn("rounded-full px-[10px] py-[5px] text-[10.5px] font-bold", ROW_TONE[r.tone])}>
                            {r.status}
                          </span>
                        </td>
                        <td className="border-b border-line-150 px-5 py-3 text-[12px] font-semibold text-navy-600">{r.ot}</td>
                        <td className="border-b border-line-150 px-5 py-3 text-[12px] font-medium text-navy-500">{r.work}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {log.length === 0 && (
                  <div className="px-5 py-10 text-center text-[12.5px] font-semibold text-brand-700">
                    Nothing marked in this range — pick another date range or use Mark Attendance
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${employee.name}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep them</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the employee and everything marked against them. It cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
