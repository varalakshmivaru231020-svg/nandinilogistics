"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, PackagePlus, Pencil, Printer, ReceiptText, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn, formatDate, money, qty } from "@/lib/utils";
import {
  approvePoAdminAction, approvePoPmAction,
  cancelPurchaseOrderAction, closePurchaseOrderAction,
} from "../actions";

interface Po {
  id: string; poNo: string; status: string; poDate: string; expectedDate: string | null;
  approvedAt: string | null; subTotal: number; taxAmount: number; otherCharges: number;
  totalAmount: number; deliveryAddress: string | null; terms: string | null;
  projectName: string; projectCode: string; vendorName: string; vendorContact: string | null;
  vendorPhone: string | null; vendorGstin: string | null; paymentTerm: string | null;
  createdByName: string;
}

interface PoLine {
  id: string; code: string; name: string; uom: string;
  orderedQty: number; receivedQty: number; rate: number; discountPct: number;
  taxPct: number; amount: number; specification: string | null;
  indentNo: string | null; indentId: string | null;
}

interface Receipt {
  id: string; grnNo: string; grnDate: string; status: string; storeName: string; lineCount: number;
}

interface Invoice {
  id: string; invoiceNo: string; invoiceDate: string; status: string;
  totalAmount: number; paidAmount: number;
}

export function PoDetail({
  po, items, receipts, invoices, can, approvalCeiling, editable,
}: {
  po: Po; items: PoLine[]; receipts: Receipt[]; invoices: Invoice[];
  can: Record<string, boolean>; approvalCeiling: number;
  /** Nobody has approved it yet — decided on the server from the approval fields. */
  editable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  // The design approves in two levels. Which one is outstanding decides both
  // the label and the action; holding one permission does not imply the other.
  const awaitingPm = ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL"].includes(po.status);
  const awaitingAdmin = po.status === "PENDING_ADMIN_APPROVAL";
  const awaitingApproval = awaitingPm || awaitingAdmin;
  const mayApproveNow = awaitingPm ? can.approvePm : awaitingAdmin ? can.approveAdmin : false;
  const approvalLabel = awaitingPm ? "PM approve" : "Admin approve";
  const receivable = ["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status);
  const aboveCeiling = approvalCeiling > 0 && po.totalAmount > approvalCeiling;

  const orderedTotal = items.reduce((s, i) => s + i.orderedQty, 0);
  const receivedTotal = items.reduce((s, i) => s + i.receivedQty, 0);
  const pct = orderedTotal > 0 ? Math.round((receivedTotal / orderedTotal) * 100) : 0;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else { setNotice(msg); router.refresh(); }
  }

  const columns: Column<PoLine>[] = [
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <div>
          <p className="text-sm text-navy-900">{l.name}</p>
          <p className="text-xs text-muted-500">
            <code>{l.code}</code>
            {l.specification && ` · ${l.specification}`}
            {l.indentNo && (
              <>
                {" · from "}
                <Link href={`/material/indents/${l.indentId}`} className="text-brand-600 hover:underline">
                  {l.indentNo}
                </Link>
              </>
            )}
          </p>
        </div>
      ),
    },
    { key: "ordered", header: "Ordered", align: "right", className: "num", render: (l) => `${qty(l.orderedQty, 3)} ${l.uom}` },
    {
      key: "received",
      header: "Received",
      align: "right",
      className: "num",
      render: (l) => {
        const full = l.receivedQty >= l.orderedQty;
        return (
          <span className={full ? "font-medium text-good-700" : l.receivedQty > 0 ? "text-warn-700" : "text-muted-400"}>
            {qty(l.receivedQty, 3)}
          </span>
        );
      },
    },
    {
      key: "pending",
      header: "Pending",
      align: "right",
      className: "num",
      render: (l) => {
        const pending = Math.max(0, l.orderedQty - l.receivedQty);
        return pending > 0 ? <span className="text-navy-900">{qty(pending, 3)}</span> : <span className="text-muted-400">—</span>;
      },
    },
    { key: "rate", header: "Rate", align: "right", className: "num", visible: can.viewRate, render: (l) => money(l.rate, true) },
    { key: "tax", header: "GST %", align: "right", className: "num", visible: can.viewRate, render: (l) => `${l.taxPct}%` },
    { key: "amount", header: "Amount", align: "right", className: "num", visible: can.viewRate, render: (l) => money(l.amount) },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Order details</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Project", `${po.projectCode} — ${po.projectName}`],
                ["Vendor", po.vendorName],
                ["Vendor contact", [po.vendorContact, po.vendorPhone].filter(Boolean).join(" · ") || "—"],
                ["GSTIN", po.vendorGstin ?? "—"],
                ["Payment term", po.paymentTerm ?? "—"],
                ["Raised by", po.createdByName],
                ["PO date", formatDate(po.poDate)],
                ["Expected delivery", formatDate(po.expectedDate)],
                ["Approved on", formatDate(po.approvedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>

            {po.deliveryAddress && (
              <div className="mt-3 border-t border-line-200 pt-3">
                <p className="text-xs text-muted-500">Delivery address</p>
                <p className="mt-0.5 text-sm text-navy-600">{po.deliveryAddress}</p>
              </div>
            )}
            {po.terms && (
              <div className="mt-3 border-t border-line-200 pt-3">
                <p className="text-xs text-muted-500">Terms</p>
                <p className="mt-0.5 text-sm text-navy-600">{po.terms}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Value &amp; actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {can.viewRate && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-500">Sub-total</span>
                  <span className="num text-navy-600">{money(po.subTotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-500">GST</span>
                  <span className="num text-navy-600">{money(po.taxAmount)}</span>
                </div>
                {po.otherCharges > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-500">Other charges</span>
                    <span className="num text-navy-600">{money(po.otherCharges)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-line-200 pt-1.5">
                  <span className="text-sm text-muted-600">Total</span>
                  <span className="num text-xl font-semibold text-navy-950">{money(po.totalAmount)}</span>
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-500">Received</span>
                <span className="num font-medium text-navy-600">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line-400">
                <div
                  className={cn("h-full rounded-full", pct === 100 ? "bg-good-600" : "bg-brand-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
              {editable && can.update && (
                <Link href={`/material/purchase-orders/${po.id}/edit`}>
                  <Button size="sm" variant="secondary" className="w-full">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit order
                  </Button>
                </Link>
              )}

              {awaitingApproval && mayApproveNow && (
                <>
                  <Button size="sm" variant="success" onClick={() => setApproving(true)} disabled={aboveCeiling}>
                    <Check className="h-3.5 w-3.5" />
                    {approvalLabel}
                  </Button>
                  {aboveCeiling && (
                    <p className="text-xs text-warn-700">
                      {money(po.totalAmount)} is above your ceiling of {money(approvalCeiling)} — this
                      must be approved at a higher level.
                    </p>
                  )}
                </>
              )}

              {receivable && can.createGrn && (
                <Link href={`/material/grn/new?po=${po.id}`}>
                  <Button size="sm" className="w-full">
                    <PackagePlus className="h-3.5 w-3.5" />
                    Receive material
                  </Button>
                </Link>
              )}

              {receivedTotal > 0 && can.createInvoice && (
                <Link href={`/material/invoices/new?po=${po.id}`}>
                  <Button size="sm" variant="secondary" className="w-full">
                    <ReceiptText className="h-3.5 w-3.5" />
                    Record vendor invoice
                  </Button>
                </Link>
              )}

              {["PARTIALLY_RECEIVED", "RECEIVED", "APPROVED"].includes(po.status) && can.close && (
                <Button size="sm" variant="ghost" loading={busy}
                  onClick={() => run(() => closePurchaseOrderAction(po.id), "Purchase order closed.")}>
                  Close purchase order
                </Button>
              )}

              {can.print && (
                <a href={`/print/purchase-orders/${po.id}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost" className="w-full">
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                </a>
              )}

              {!["CANCELLED", "CLOSED"].includes(po.status) && can.cancel && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                  <Ban className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}

              {awaitingApproval && !mayApproveNow && (
                <p className="text-xs text-muted-500">
                  Waiting for approval. You do not hold the PO approval permission.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {can.tabItems && (
        <Card>
          <CardHeader><CardTitle>Items ({items.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <DataTable columns={columns} rows={items} rowKey={(l) => l.id} dense />
          </CardBody>
        </Card>
      )}

      {can.tabReceipts && (
        <Card>
          <CardHeader>
            <CardTitle>Goods receipts ({receipts.length})</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {receipts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-500">
                Nothing received against this PO yet.
              </p>
            ) : (
              <ul className="divide-y divide-line-200">
                {receipts.map((g) => (
                  <li key={g.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <Link href={`/material/grn/${g.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                        {g.grnNo}
                      </Link>
                      <p className="text-xs text-muted-500">
                        {g.storeName} · {g.lineCount} line(s) · {formatDate(g.grnDate)}
                      </p>
                    </div>
                    <Badge tone={g.status === "POSTED" ? "good" : g.status === "CANCELLED" ? "bad" : "warn"}>
                      {g.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {can.tabInvoices && (
        <Card>
          <CardHeader><CardTitle>Vendor invoices ({invoices.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            {invoices.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-500">
                No invoice recorded against this PO yet.
              </p>
            ) : (
              <ul className="divide-y divide-line-200">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <Link href={`/material/invoices/${i.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                        {i.invoiceNo}
                      </Link>
                      <p className="text-xs text-muted-500">
                        {formatDate(i.invoiceDate)} · {money(i.paidAmount)} of {money(i.totalAmount)} paid
                      </p>
                    </div>
                    <Badge tone={i.status === "PAID" ? "good" : i.status === "MISMATCH" ? "bad" : "slate"}>
                      {i.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {approving && (
        <RemarkModal
          title={`${approvalLabel} ${po.poNo}`}
          description={
            awaitingPm
              ? `Passing ${po.poNo} to the Admin level. It commits nothing until that second approval.`
              : `Approving commits ${money(po.totalAmount)} to ${po.vendorName}.`
          }
          confirmLabel={approvalLabel}
          variant="success"
          onClose={() => setApproving(false)}
          onSubmit={async (remarks) => {
            const res = awaitingPm
              ? await approvePoPmAction(po.id, remarks)
              : await approvePoAdminAction(po.id, remarks);
            if (res.ok) {
              setApproving(false);
              setNotice(awaitingPm ? "Passed to the Admin level." : "Purchase order approved.");
              router.refresh();
            }
            return res.ok ? null : res.error;
          }}
        />
      )}

      {cancelling && (
        <RemarkModal
          title={`Cancel ${po.poNo}`}
          description="A reason is required and stays on the audit trail."
          confirmLabel="Cancel purchase order"
          variant="danger"
          required
          onClose={() => setCancelling(false)}
          onSubmit={async (remarks) => {
            const res = await cancelPurchaseOrderAction(po.id, remarks);
            if (res.ok) { setCancelling(false); setNotice("Purchase order cancelled."); router.refresh(); }
            return res.ok ? null : res.error;
          }}
        />
      )}
    </div>
  );
}

function RemarkModal({
  title, description, confirmLabel, variant, required, onClose, onSubmit,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  variant: "success" | "danger";
  required?: boolean;
  onClose: () => void;
  onSubmit: (remarks: string) => Promise<string | null>;
}) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSubmit(remarks);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant={variant} onClick={submit} loading={busy} disabled={required && !remarks.trim()}>
            {variant === "danger" ? <XCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Remarks" required={required}>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
