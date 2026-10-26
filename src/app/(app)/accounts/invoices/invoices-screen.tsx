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
import {
  INVOICE_EMPTY_FILTERED, INVOICE_EMPTY_NONE,
} from "@/lib/accounts/list-filters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUSES, type InvoiceStatus } from "@/lib/accounts/status";
import { cn, formatDate, money } from "@/lib/utils";
import {
  createInvoiceAction, deleteInvoiceAction, markInvoiceSentAction, recordInvoicePaymentAction,
  updateInvoiceAction,
} from "./actions";

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  companyId: string;
  company: string;
  invoiceDate: string;
  dueDate: string | null;
  amount: number;
  outstanding: number;
  status: string;
  notes: string | null;
  payments: number;
}

export const INVOICE_STATUS_PILL: Record<InvoiceStatus, string> = {
  RAISED: "bg-surface-field text-navy-600",
  SENT: "bg-brand-100 text-brand-700",
  PARTIALLY_PAID: "bg-warn-050 text-warn-800",
  PAID: "bg-good-050 text-good-700",
  OVERDUE: "bg-bad-050 text-bad-700",
};

export function InvoicesScreen({
  invoices, companies, picked, q, figures, can,
}: {
  invoices: InvoiceRow[];
  companies: Array<{ id: string; name: string }>;
  picked: { company: string; status: string; from: string; to: string };
  q: string;
  figures: StatFigure[];
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<InvoiceRow | "new" | null>(null);
  const [paying, setPaying] = React.useState<InvoiceRow | null>(null);
  const [deleting, setDeleting] = React.useState<InvoiceRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  function go(next: Partial<Record<"company" | "status" | "from" | "to" | "q", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = { q, ...picked, ...next };
    for (const [k, v] of Object.entries(now)) if (v) params.set(k, v);
    router.push(`/accounts/invoices${params.toString() ? `?${params}` : ""}`);
  }

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return false; }
    toast(done);
    router.refresh();
    return true;
  }

  const filtered = Boolean(picked.company || picked.status || picked.from || picked.to || q);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Vendor Invoices"
        description="Invoices expected from each client company — raised, sent, paid in part or in full, and overdue."
        actions={
          <div className="flex items-center gap-2">
            {can.export && <ExportMenu href={(f) => exportHref("/api/accounts/invoices/export", f, query)} />}
            {can.create && <Button size="sm" onClick={() => setEditing("new")}>+ New invoice</Button>}
          </div>
        }
      />

      <ModuleStats figures={figures} />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <input
          defaultValue={q}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value || null }); }}
          onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value || null }); }}
          placeholder="Search invoice no., company…"
          className="w-[260px] rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
        />
        <span className="text-[11px] font-semibold text-muted-400">Company</span>
        <select value={picked.company} onChange={(e) => go({ company: e.target.value || null })} className="max-w-[180px] cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-[11px] font-semibold text-muted-400">Status</span>
        <select value={picked.status} onChange={(e) => go({ status: e.target.value || null })} className="cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}
        </select>
        <span className="text-[11px] font-semibold text-muted-400">Dated</span>
        <input type="date" value={picked.from} onChange={(e) => go({ from: e.target.value || null })} className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900" />
        <span className="text-[11px] font-medium text-muted-400">to</span>
        <input type="date" value={picked.to} onChange={(e) => go({ to: e.target.value || null })} className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900" />
        {filtered && (
          <button type="button" onClick={() => go({ company: null, status: null, from: null, to: null, q: null })} className="cursor-pointer text-[11.5px] font-semibold text-brand-700 hover:underline">
            Clear filters
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[11.5px] font-medium text-muted-600">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              <Th>Invoice</Th><Th>Company</Th><Th>Dated</Th><Th>Due</Th>
              <Th className="text-right">Amount</Th><Th className="text-right">Outstanding</Th><Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className={cn("hover:bg-surface-tint", i.status === "OVERDUE" && "bg-bad-025")}>
                <Td>
                  <Link href={`/accounts/invoices/${i.id}`} className="block">
                    <span className="num text-[13px] font-semibold text-navy-800 hover:text-brand-700">{i.invoiceNo}</span>
                    {i.notes && <span className="mt-0.5 block max-w-[260px] truncate text-[11px] font-medium text-muted-400">{i.notes}</span>}
                  </Link>
                </Td>
                <Td className="text-[12.5px] font-semibold text-navy-700">{i.company}</Td>
                <Td className="text-[12px] font-medium text-navy-700">{formatDate(i.invoiceDate)}</Td>
                <Td className={cn("text-[12px] font-medium", i.status === "OVERDUE" ? "text-bad-600" : "text-navy-700")}>{i.dueDate ? formatDate(i.dueDate) : "—"}</Td>
                <Td className="num text-right text-[12.5px] font-semibold text-navy-900">{money(i.amount)}</Td>
                <Td className={cn("num text-right text-[12.5px] font-semibold", i.outstanding > 0 ? "text-warn-800" : "text-good-700")}>{money(i.outstanding)}</Td>
                <Td>
                  <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold", INVOICE_STATUS_PILL[i.status as InvoiceStatus])}>
                    {INVOICE_STATUS_LABEL[i.status as InvoiceStatus] ?? i.status}
                  </span>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {can.update && i.status === "RAISED" && (
                      <RowButton onClick={() => run(() => markInvoiceSentAction(i.id), "Marked sent.")} disabled={busy}>Mark sent</RowButton>
                    )}
                    {can.recordPayment && i.status !== "PAID" && (
                      <RowButton primary onClick={() => setPaying(i)}>Record payment</RowButton>
                    )}
                    {can.update && <RowButton onClick={() => setEditing(i)}>Edit</RowButton>}
                    {can.delete && i.payments === 0 && <RowButton danger onClick={() => setDeleting(i)}>Delete</RowButton>}
                  </div>
                </Td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {filtered ? INVOICE_EMPTY_FILTERED.title : INVOICE_EMPTY_NONE.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <InvoiceForm
          invoice={editing === "new" ? null : editing}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {paying && (
        <PaymentForm invoice={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); router.refresh(); }} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting && await run(() => deleteInvoiceAction(deleting.id), "Invoice deleted.")) setDeleting(null); }}
        title={`Delete ${deleting?.invoiceNo ?? "invoice"}?`}
        message="Only an invoice with no payments recorded can be deleted. This cannot be undone."
        loading={busy}
      />
    </div>
  );
}

/* ---------------------------------- forms --------------------------------- */

export function InvoiceForm({
  invoice, companies, onClose, onSaved,
}: {
  invoice: InvoiceRow | null;
  companies: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = invoice ? await updateInvoiceAction(invoice.id, fd) : await createInvoiceAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(invoice ? "Invoice changed." : "Invoice raised.");
    onSaved();
  }

  return (
    <Modal
      open onClose={onClose} title={invoice ? `Edit ${invoice.invoiceNo}` : "New invoice"} size="sm"
      description={invoice ? undefined : "The invoice number is generated. Only the company, the date and the amount are mandatory."}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="invoice-form" loading={busy}>{invoice ? "Save changes" : "Raise invoice"}</Button>
        </>
      }
    >
      <form id="invoice-form" action={submit} className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Company" required>
          <Select name="companyId" defaultValue={invoice?.companyId ?? ""} required>
            <option value="" disabled>Select…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice date" required>
            <Input name="invoiceDate" type="date" defaultValue={invoice?.invoiceDate.slice(0, 10) ?? ""} required />
          </Field>
          <Field label="Due date">
            <Input name="dueDate" type="date" defaultValue={invoice?.dueDate?.slice(0, 10) ?? ""} />
          </Field>
        </div>
        <Field label="Amount (₹)" required>
          <Input name="amount" type="number" min={1} step="0.01" defaultValue={invoice?.amount ?? ""} required />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" defaultValue={invoice?.notes ?? ""} placeholder="Period covered, PO reference…" className="min-h-[64px]" />
        </Field>
      </form>
    </Modal>
  );
}

export function PaymentForm({
  invoice, onClose, onSaved,
}: { invoice: InvoiceRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await recordInvoicePaymentAction(invoice.id, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(res.data.status === "PAID" ? "Paid in full." : "Payment recorded.");
    onSaved();
  }

  return (
    <Modal
      open onClose={onClose} title={`Payment against ${invoice.invoiceNo}`} size="sm"
      description={`${money(invoice.outstanding)} outstanding of ${money(invoice.amount)}.`}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="payment-form" loading={busy}>Record payment</Button>
        </>
      }
    >
      <form id="payment-form" action={submit} className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Amount received (₹)" required>
          <Input name="amount" type="number" min={0.01} step="0.01" defaultValue={invoice.outstanding} required autoFocus />
        </Field>
        <Field label="Received on" required>
          <Input name="paidOn" type="date" required />
        </Field>
        <Field label="Reference" hint="UTR, cheque number or anything that identifies the payment.">
          <Input name="reference" placeholder="UTR / cheque no." />
        </Field>
      </form>
    </Modal>
  );
}

/* --------------------------------- pieces --------------------------------- */

function RowButton({
  children, onClick, disabled, primary, danger,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-[7px] px-[11px] py-[5px] text-[10.5px] font-bold transition-colors disabled:opacity-60",
        primary
          ? "bg-brand-500 text-white hover:bg-brand-600"
          : danger
            ? "border border-[#F2CBCB] bg-[#FCEDED] text-[#B23334] hover:bg-[#F8DBDB]"
            : "border border-line-400 bg-white font-semibold text-muted-600 hover:border-brand-500 hover:text-brand-700",
      )}
    >
      {children}
    </button>
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
