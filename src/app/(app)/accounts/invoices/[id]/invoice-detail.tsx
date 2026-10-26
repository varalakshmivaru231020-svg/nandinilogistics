"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/accounts/status";
import { cn, formatDate, money } from "@/lib/utils";
import { deleteInvoiceAction, markInvoiceSentAction } from "../actions";
import { INVOICE_STATUS_PILL, InvoiceForm, PaymentForm, type InvoiceRow } from "../invoices-screen";

export function InvoiceDetail({
  invoice, payments, companies, can,
}: {
  invoice: InvoiceRow;
  payments: Array<{ id: string; amount: number; paidOn: string; reference: string | null }>;
  companies: Array<{ id: string; name: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const status = invoice.status as InvoiceStatus;
  const received = invoice.amount - invoice.outstanding;

  async function send() {
    setBusy(true);
    const res = await markInvoiceSentAction(invoice.id);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Marked sent.");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await deleteInvoiceAction(invoice.id);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Invoice deleted.");
    router.push("/accounts/invoices");
  }

  return (
    <div className="animate-fade-up grid gap-3.5 lg:grid-cols-3">
      <div className="space-y-3.5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoice</CardTitle>
            <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-bold", INVOICE_STATUS_PILL[status])}>
              {INVOICE_STATUS_LABEL[status] ?? status}
            </span>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ["Company", invoice.company],
                ["Invoice date", formatDate(invoice.invoiceDate)],
                ["Due date", invoice.dueDate ? formatDate(invoice.dueDate) : "—"],
                ["Amount", money(invoice.amount)],
                ["Received", money(received)],
                ["Outstanding", money(invoice.outstanding)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold text-muted-500">{label}</dt>
                  <dd className="num mt-0.5 text-[13px] font-semibold text-navy-900">{value}</dd>
                </div>
              ))}
              {invoice.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold text-muted-500">Notes</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-[12.5px] font-medium text-navy-700">{invoice.notes}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments received</CardTitle>
            {can.recordPayment && status !== "PAID" && (
              <Button size="sm" onClick={() => setPaying(true)}>Record payment</Button>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {payments.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] font-medium text-muted-400">Nothing received yet.</p>
            ) : (
              <ul className="divide-y divide-line-200">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-[12.5px] font-semibold text-navy-900">{formatDate(p.paidOn)}</p>
                      <p className="text-[11px] font-medium text-muted-400">{p.reference ?? "No reference"}</p>
                    </div>
                    <span className="num text-[13px] font-bold text-good-700">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-3.5">
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardBody className="flex flex-col gap-2">
            {can.update && status === "RAISED" && (
              <Button variant="secondary" size="sm" onClick={send} loading={busy}>Mark sent to the client</Button>
            )}
            {can.update && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit invoice</Button>}
            {can.delete && payments.length === 0 && (
              <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>Delete invoice</Button>
            )}
            {!can.update && !can.recordPayment && !can.delete && (
              <p className="text-[12px] font-medium text-muted-400">You can view this invoice.</p>
            )}
          </CardBody>
        </Card>
        <p className="px-1 text-[11.5px] font-medium text-muted-400">
          Raised → Sent → Partially paid → Paid. An unpaid invoice past its due date reads Overdue until it is settled.
        </p>
      </div>

      {editing && (
        <InvoiceForm invoice={invoice} companies={companies} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />
      )}
      {paying && (
        <PaymentForm invoice={invoice} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); router.refresh(); }} />
      )}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        title={`Delete ${invoice.invoiceNo}?`}
        message="Only an invoice with no payments recorded can be deleted. This cannot be undone."
        loading={busy}
      />
    </div>
  );
}
