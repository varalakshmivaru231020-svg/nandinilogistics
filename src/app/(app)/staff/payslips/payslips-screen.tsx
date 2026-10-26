"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ModuleStats, type StatFigure } from "@/components/list/module-stats";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PAYSLIP_EMPTY_FILTERED, PAYSLIP_EMPTY_NONE } from "@/lib/staff/list-filters";
import { monthLabel } from "@/lib/staff/payslip";
import { cn, money } from "@/lib/utils";
import { deletePayslipAction, generatePayslipAction, payslipDraftAction } from "./actions";

interface PayslipRow {
  id: string;
  month: string;
  employeeId: string;
  employee: string;
  code: string;
  gross: number;
  advance: number;
  deductions: number;
  netPay: number;
  payableDays: number | null;
  hasPdf: boolean;
}

interface Staff {
  id: string;
  name: string;
  code: string;
  monthlySalary: number | null;
  designation: string | null;
}

export function PayslipsScreen({
  payslips, staff, picked, q, figures, thisMonth, can,
}: {
  payslips: PayslipRow[];
  staff: Staff[];
  picked: { month: string; employee: string };
  q: string;
  figures: StatFigure[];
  thisMonth: string;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PayslipRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  function go(next: Partial<Record<"month" | "employee" | "q", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = { q, ...picked, ...next };
    for (const [k, v] of Object.entries(now)) if (v) params.set(k, v);
    router.push(`/staff/payslips${params.toString() ? `?${params}` : ""}`);
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const res = await deletePayslipAction(deleting.id);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Payslip deleted.");
    setDeleting(null);
    router.refresh();
  }

  const filtered = Boolean(picked.month || picked.employee || q);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Payslips"
        description="Monthly payslips for internal staff — gross, advance recovery, deductions and net pay, each as a PDF."
        actions={
          <div className="flex items-center gap-2">
            {can.export && <ExportMenu href={(f) => exportHref("/api/staff/payslips/export", f, query)} />}
            {can.create && <Button size="sm" onClick={() => setCreating(true)}>+ Generate payslip</Button>}
          </div>
        }
      />

      <ModuleStats figures={figures} />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <input
          defaultValue={q}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value || null }); }}
          onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value || null }); }}
          placeholder="Search name, employee ID…"
          className="w-[240px] rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
        />
        <span className="text-[11px] font-semibold text-muted-400">Month</span>
        <input type="month" value={picked.month} onChange={(e) => go({ month: e.target.value || null })} className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900" />
        <span className="text-[11px] font-semibold text-muted-400">Staff</span>
        <select value={picked.employee} onChange={(e) => go({ employee: e.target.value || null })} className="max-w-[200px] cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900">
          <option value="">Everyone</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filtered && (
          <button type="button" onClick={() => go({ month: null, employee: null, q: null })} className="cursor-pointer text-[11.5px] font-semibold text-brand-700 hover:underline">
            Clear filters
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[11.5px] font-medium text-muted-600">{payslips.length} payslip{payslips.length === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <Th>Staff</Th><Th>Month</Th><Th className="text-right">Days</Th>
              <Th className="text-right">Gross</Th><Th className="text-right">Advance</Th>
              <Th className="text-right">Deductions</Th><Th className="text-right">Net pay</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id} className="hover:bg-surface-tint">
                <Td>
                  <Link href={`/staff/payslips/${p.id}`} className="block">
                    <span className="text-[13px] font-semibold text-navy-800 hover:text-brand-700">{p.employee}</span>
                    <span className="num mt-0.5 block text-[11px] font-medium text-muted-400">{p.code}</span>
                  </Link>
                </Td>
                <Td className="text-[12.5px] font-semibold text-navy-700">{monthLabel(p.month)}</Td>
                <Td className="num text-right text-[12px] font-medium text-navy-700">{p.payableDays ?? "—"}</Td>
                <Td className="num text-right text-[12.5px] font-medium text-navy-700">{money(p.gross)}</Td>
                <Td className="num text-right text-[12.5px] font-medium text-warn-800">{money(p.advance)}</Td>
                <Td className="num text-right text-[12.5px] font-medium text-navy-700">{money(p.deductions)}</Td>
                <Td className="num text-right text-[13px] font-bold text-good-700">{money(p.netPay)}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {p.hasPdf && (
                      <a href={`/api/staff/payslips/${p.id}`} target="_blank" rel="noreferrer" className="rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-brand-700 hover:border-brand-500">
                        PDF
                      </a>
                    )}
                    {can.delete && (
                      <button type="button" onClick={() => setDeleting(p)} className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB]">
                        Delete
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {payslips.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {filtered ? PAYSLIP_EMPTY_FILTERED.title : PAYSLIP_EMPTY_NONE.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <GeneratePayslip staff={staff} thisMonth={thisMonth} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); router.push(`/staff/payslips/${id}`); }} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete the ${deleting ? monthLabel(deleting.month) : ""} payslip?`}
        message="The record and its PDF go. It can be generated again afterwards."
        loading={busy}
      />
    </div>
  );
}

/* --------------------------------- generate -------------------------------- */

function GeneratePayslip({
  staff, thisMonth, onClose, onSaved,
}: { staff: Staff[]; thisMonth: string; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = React.useState("");
  const [month, setMonth] = React.useState(thisMonth);
  const [draft, setDraft] = React.useState<{ gross: string; payableDays: string; advance: string; marked: number } | null>(null);
  const [gross, setGross] = React.useState("");
  const [advance, setAdvance] = React.useState("0");
  const [deductions, setDeductions] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The figures the slip starts from come from the record: the salary on
  // file, the month's attendance and the advance recovery due. Read whenever
  // the person or the month is picked, and on demand.
  const loadDraft = React.useCallback(async (who: string, when: string) => {
    if (!who || !/^\d{4}-\d{2}$/.test(when)) { setDraft(null); return; }
    const res = await payslipDraftAction(who, when);
    if (!res.ok) { setError(res.error); setDraft(null); return; }
    setError(null);
    const d = { gross: String(res.data.gross), payableDays: String(res.data.payableDays), advance: String(res.data.advance), marked: res.data.marked };
    setDraft(d);
    setGross(d.gross);
    setAdvance(d.advance);
  }, []);


  const net = Math.max(0, Number(gross || 0) - Number(advance || 0) - Number(deductions || 0));

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await generatePayslipAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast("Payslip generated.");
    onSaved(res.data.id);
  }

  return (
    <Modal
      open onClose={onClose} title="Generate payslip" size="sm"
      description="Pick the staff member and the month. Gross starts from the salary on file; days and the advance recovery come from the records."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="payslip-form" loading={busy} disabled={!employeeId}>Generate PDF</Button>
        </>
      }
    >
      <form id="payslip-form" action={submit} className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {staff.length === 0 && <Alert tone="warn">No active internal staff on record — add one under Riders &amp; Staff with the employment type “Internal Staff”.</Alert>}
        <Field label="Staff member" required>
          <Select name="employeeId" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); void loadDraft(e.target.value, month); }} required>
            <option value="" disabled>Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}
          </Select>
        </Field>
        <Field label="Month" required>
          <Input name="month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); void loadDraft(employeeId, e.target.value); }} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gross salary (₹)" required hint={draft && Number(draft.gross) === 0 ? "No monthly salary on file — enter it." : undefined}>
            <Input name="gross" type="number" min={1} step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} required />
          </Field>
          <Field label="Payable days" hint={draft ? `${draft.marked} day(s) marked this month` : undefined}>
            <Input name="payableDays" type="number" min={0} max={31} step="0.5" defaultValue={draft?.payableDays ?? ""} key={draft?.payableDays ?? "none"} />
          </Field>
          <Field label="Advance recovery (₹)" hint="From approved advances being recovered.">
            <Input name="advance" type="number" min={0} step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} />
          </Field>
          <Field label="Other deductions (₹)">
            <Input name="deductions" type="number" min={0} step="0.01" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" placeholder="Shown on the payslip" className="min-h-[56px]" />
        </Field>
        <div className={cn("rounded-[10px] border px-3.5 py-2.5 text-[12.5px] font-semibold", net > 0 ? "border-good-400 bg-good-050 text-good-700" : "border-line-400 bg-surface-field text-muted-600")}>
          Net pay: <span className="num">{money(net)}</span>
        </div>
      </form>
    </Modal>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("border-b border-line-150 bg-surface-sunken px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-line-150 px-4 py-3 align-middle", className)}>{children}</td>;
}
