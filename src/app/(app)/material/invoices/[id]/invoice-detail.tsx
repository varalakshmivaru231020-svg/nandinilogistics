"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Check, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, qty } from "@/lib/utils";
import {
  approveInvoiceAction, cancelInvoiceAction, recordPaymentAction, rematchInvoiceAction,
} from "../actions";

interface Invoice {
  id: string; invoiceNo: string; status: string; invoiceDate: string; receivedDate: string;
  subTotal: number; taxAmount: number; totalAmount: number; paidAmount: number;
  remarks: string | null; vendorName: string; vendorGstin: string | null;
  poId: string; poNo: string; projectCode: string;
}

interface Line {
  id: string; code: string; name: string; uom: string;
  invoicedQty: number; rate: number; taxPct: number; amount: number;
}

interface MatchResult {
  matched: boolean;
  issues: string[];
  lines: Array<{ itemName: string; qtyVariance: number; rateVariance: number; issues: string[] }>;
}

interface Payment {
  id: string; paymentNo: string; paymentDate: string; amount: number;
  mode: string; referenceNo: string | null;
}

export function InvoiceDetail({
  invoice, items, match, payments, can,
}: {
  invoice: Invoice; items: Line[]; match: MatchResult | null;
  payments: Payment[]; can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const mismatched = invoice.status === "MISMATCH";
  const outstanding = invoice.totalAmount - invoice.paidAmount;
  const approvable = ["DRAFT", "MATCHED", "MISMATCH"].includes(invoice.status);
  const payable = ["APPROVED", "PARTIALLY_PAID"].includes(invoice.status) && outstanding > 0.01;

  async function rematch() {
    setBusy(true);
    setError(null);
    const res = await rematchInvoiceAction(invoice.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotice(res.data.matched ? "Match re-run — it now passes." : "Match re-run — still mismatched.");
      router.refresh();
    }
  }

  const columns: Column<Line>[] = [
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <div>
          <p className="text-sm text-navy-900">{l.name}</p>
          <p className="text-xs text-muted-500"><code>{l.code}</code></p>
        </div>
      ),
    },
    { key: "qty", header: "Billed", align: "right", className: "num", render: (l) => `${qty(l.invoicedQty, 3)} ${l.uom}` },
    { key: "rate", header: "Rate", align: "right", className: "num", render: (l) => money(l.rate, true) },
    { key: "tax", header: "GST %", align: "right", className: "num", render: (l) => `${l.taxPct}%` },
    { key: "amount", header: "Amount", align: "right", className: "num", render: (l) => money(l.amount) },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {/* The match verdict is the headline on this screen. */}
      <Card className={mismatched ? "border-bad-600" : match?.matched ? "border-good-600" : undefined}>
        <CardHeader>
          <CardTitle>Three-way match</CardTitle>
          <div className="flex items-center gap-2">
            {match && (
              <Badge tone={match.matched ? "good" : "bad"}>
                {match.matched ? "Passed" : "Failed"}
              </Badge>
            )}
            {can.match && !["PAID", "CANCELLED"].includes(invoice.status) && (
              <Button variant="secondary" size="xs" onClick={rematch} loading={busy}>
                <RefreshCw className="h-3 w-3" />
                Re-run
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {!match ? (
            <p className="text-sm text-muted-500">No comparison stored for this invoice.</p>
          ) : match.matched ? (
            <p className="flex items-center gap-2 text-sm text-good-700">
              <Check className="h-4 w-4" />
              Purchase order, goods receipt and invoice agree on every line.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-bad-600">
                <TriangleAlert className="h-4 w-4" />
                {match.issues.length} variance(s) blocking payment
              </p>
              <ul className="space-y-1">
                {match.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-xs text-bad-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-bad-600" />
                    {issue}
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-xs text-muted-500">
                Resolve the variance — usually by posting the outstanding goods receipt — or approve
                it as an explicit override, which is recorded against your name.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Invoice details</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Purchase order", invoice.poNo],
                ["Project", invoice.projectCode],
                ["Vendor", invoice.vendorName],
                ["GSTIN", invoice.vendorGstin ?? "—"],
                ["Invoice date", formatDate(invoice.invoiceDate)],
                ["Received on", formatDate(invoice.receivedDate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">
                    {label === "Purchase order" ? (
                      <Link href={`/material/purchase-orders/${invoice.poId}`} className="text-brand-600 hover:underline">
                        {value}
                      </Link>
                    ) : value}
                  </dd>
                </div>
              ))}
            </dl>
            {invoice.remarks && (
              <p className="mt-3 border-t border-line-200 pt-3 text-sm text-muted-600">{invoice.remarks}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Amount &amp; actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-500">Sub-total</span>
                <span className="num text-navy-600">{money(invoice.subTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-500">GST</span>
                <span className="num text-navy-600">{money(invoice.taxAmount)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line-200 pt-1.5">
                <span className="text-sm text-muted-600">Total</span>
                <span className="num text-xl font-semibold text-navy-950">{money(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-500">Paid</span>
                <span className="num text-good-700">{money(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-500">Outstanding</span>
                <span className="num font-medium text-navy-900">{money(outstanding)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
              {approvable && can.approve && (
                <Button
                  size="sm"
                  variant={mismatched ? "warning" : "success"}
                  onClick={() => setApproving(true)}
                  disabled={mismatched && !can.override}
                >
                  {mismatched ? <ShieldAlert className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {mismatched ? "Override & approve" : "Approve for payment"}
                </Button>
              )}

              {mismatched && can.approve && !can.override && (
                <p className="text-xs text-warn-700">
                  This invoice is blocked by the match. Clearing it needs the override permission,
                  which you do not hold.
                </p>
              )}

              {payable && can.pay && (
                <Button size="sm" onClick={() => setPaying(true)}>
                  <Banknote className="h-3.5 w-3.5" />
                  Record payment
                </Button>
              )}

              {!["PAID", "CANCELLED"].includes(invoice.status) && can.cancel && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                  <Ban className="h-3.5 w-3.5" />
                  Cancel invoice
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines ({items.length})</CardTitle></CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} rows={items} rowKey={(l) => l.id} dense />
        </CardBody>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Payments ({payments.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-navy-900">{p.paymentNo}</p>
                    <p className="text-xs text-muted-500">
                      {formatDate(p.paymentDate)} · {p.mode}
                      {p.referenceNo && ` · ${p.referenceNo}`}
                    </p>
                  </div>
                  <span className="num text-sm font-medium text-navy-950">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {approving && (
        <ApproveModal
          invoiceId={invoice.id}
          mismatched={mismatched}
          amount={invoice.totalAmount}
          issues={match?.issues ?? []}
          onClose={() => setApproving(false)}
          onDone={(m) => { setApproving(false); setNotice(m); router.refresh(); }}
        />
      )}

      {paying && (
        <PaymentModal
          invoiceId={invoice.id}
          outstanding={outstanding}
          vendorName={invoice.vendorName}
          onClose={() => setPaying(false)}
          onDone={(m) => { setPaying(false); setNotice(m); router.refresh(); }}
        />
      )}

      {cancelling && (
        <CancelModal
          invoiceId={invoice.id}
          invoiceNo={invoice.invoiceNo}
          onClose={() => setCancelling(false)}
          onDone={(m) => { setCancelling(false); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ApproveModal({
  invoiceId, mismatched, amount, issues, onClose, onDone,
}: {
  invoiceId: string; mismatched: boolean; amount: number; issues: string[];
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await approveInvoiceAction(invoiceId, remarks, mismatched);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(mismatched ? "Approved as an override — recorded on the audit trail." : "Invoice approved for payment.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mismatched ? "Override the mismatch and approve" : "Approve for payment"}
      description={`This clears ${money(amount)} for payment.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Back</Button>
          <Button
            variant={mismatched ? "warning" : "success"}
            onClick={submit}
            loading={busy}
            disabled={mismatched && !remarks.trim()}
          >
            {mismatched ? "Override & approve" : "Approve"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}

        {mismatched && (
          <Alert tone="warn" title="You are overriding a blocked match">
            <ul className="mt-1 space-y-0.5">
              {issues.map((i, n) => <li key={n}>• {i}</li>)}
            </ul>
            <p className="mt-1.5">Your name and justification are stored against this approval.</p>
          </Alert>
        )}

        <Field label={mismatched ? "Justification" : "Remarks"} required={mismatched}>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function PaymentModal({
  invoiceId, outstanding, vendorName, onClose, onDone,
}: {
  invoiceId: string; outstanding: number; vendorName: string;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [amount, setAmount] = React.useState(String(outstanding));
  const [mode, setMode] = React.useState("NEFT");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await recordPaymentAction(invoiceId, Number(amount), mode, referenceNo, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(`Payment ${res.data.paymentNo} recorded.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pay ${vendorName}`}
      description={`${money(outstanding)} outstanding on this invoice.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!(Number(amount) > 0)}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Amount (₹)" required>
          <Input type="number" step="any" min={0} className="num text-right"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Mode" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["NEFT", "RTGS", "CHEQUE", "UPI", "CASH"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Reference number">
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="UTR / cheque number" />
        </Field>
        <Field label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function CancelModal({
  invoiceId, invoiceNo, onClose, onDone,
}: { invoiceId: string; invoiceNo: string; onClose: () => void; onDone: (m: string) => void }) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelInvoiceAction(invoiceId, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Invoice cancelled.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${invoiceNo}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!remarks.trim()}>
            Cancel invoice
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Reason" required>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
