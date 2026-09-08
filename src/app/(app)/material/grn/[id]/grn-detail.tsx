"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ClipboardCheck, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, qty } from "@/lib/utils";
import { cancelGrnAction, inspectGrnAction, postGrnAction } from "../actions";

interface Grn {
  id: string; grnNo: string; status: string; grnDate: string;
  challanNo: string | null; challanDate: string | null; vehicleNo: string | null;
  remarks: string | null; inspectedAt: string | null;
  storeName: string; vendorName: string; receivedByName: string;
  poId: string; poNo: string; projectCode: string;
}

interface Line {
  id: string; code: string; name: string; uom: string;
  receivedQty: number; acceptedQty: number; rejectedQty: number; shortQty: number;
  rate: number; rejectionReason: string | null;
}

interface LedgerRow {
  id: string; itemName: string; quantity: number; rate: number; value: number; balanceQty: number;
}

export function GrnDetail({
  grn, items, ledger, can,
}: { grn: Grn; items: Line[]; ledger: LedgerRow[]; can: Record<string, boolean> }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [inspecting, setInspecting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const posted = grn.status === "POSTED";
  const cancelled = grn.status === "CANCELLED";
  const acceptedValue = items.reduce((s, l) => s + l.acceptedQty * l.rate, 0);
  const totalRejected = items.reduce((s, l) => s + l.rejectedQty, 0);
  const nothingAccepted = items.every((l) => l.acceptedQty <= 0);

  async function post() {
    setBusy(true);
    setError(null);
    const res = await postGrnAction(grn.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotice(`Posted to stock — ${res.data.postedLines} line(s) entered the ledger.`);
      router.refresh();
    }
  }

  const columns: Column<Line>[] = [
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <div>
          <p className="text-sm text-slate-800">{l.name}</p>
          <p className="text-xs text-slate-500"><code>{l.code}</code></p>
        </div>
      ),
    },
    { key: "received", header: "Received", align: "right", className: "num", render: (l) => `${qty(l.receivedQty, 3)} ${l.uom}` },
    {
      key: "accepted", header: "Accepted", align: "right", className: "num",
      render: (l) => <span className="font-medium text-emerald-700">{qty(l.acceptedQty, 3)}</span>,
    },
    {
      key: "rejected", header: "Rejected", align: "right", className: "num",
      render: (l) =>
        l.rejectedQty > 0
          ? <span className="font-medium text-red-600">{qty(l.rejectedQty, 3)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      key: "short", header: "Short", align: "right", className: "num",
      render: (l) => (l.shortQty > 0 ? <span className="text-amber-700">{qty(l.shortQty, 3)}</span> : <span className="text-slate-400">—</span>),
    },
    { key: "rate", header: "Rate", align: "right", className: "num", visible: can.viewValuation, render: (l) => money(l.rate, true) },
    {
      key: "value", header: "Accepted value", align: "right", className: "num", visible: can.viewValuation,
      render: (l) => money(l.acceptedQty * l.rate),
    },
    {
      key: "reason", header: "Rejection reason",
      render: (l) => <span className="text-xs text-slate-600">{l.rejectionReason ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {posted && (
        <Alert tone="success" title="Posted to stock">
          The accepted quantity is in the ledger and the purchase order has been advanced. The ledger
          is never rewritten — a correction is posted as a stock adjustment.
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Receipt details</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Purchase order", grn.poNo],
                ["Project", grn.projectCode],
                ["Vendor", grn.vendorName],
                ["Received into", grn.storeName],
                ["Received by", grn.receivedByName],
                ["Received on", formatDate(grn.grnDate)],
                ["Challan", grn.challanNo ?? "—"],
                ["Challan date", formatDate(grn.challanDate)],
                ["Vehicle", grn.vehicleNo ?? "—"],
                ["Inspected on", formatDate(grn.inspectedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-slate-800">
                    {label === "Purchase order" ? (
                      <Link href={`/material/purchase-orders/${grn.poId}`} className="text-brand-600 hover:underline">
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {grn.remarks && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{grn.remarks}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {can.viewValuation && (
              <div>
                <p className="text-xs text-slate-500">Value of accepted stock</p>
                <p className="num text-2xl font-semibold text-slate-900">{money(acceptedValue)}</p>
                {totalRejected > 0 && (
                  <p className="mt-0.5 text-xs text-red-600">{qty(totalRejected, 3)} rejected, not stocked</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
              {!posted && !cancelled && can.inspect && (
                <Button size="sm" variant="secondary" onClick={() => setInspecting(true)}>
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Record inspection
                </Button>
              )}

              {!posted && !cancelled && can.post && (
                <>
                  <Button size="sm" variant="success" onClick={post} loading={busy} disabled={nothingAccepted}>
                    <Warehouse className="h-3.5 w-3.5" />
                    Post to stock
                  </Button>
                  {nothingAccepted && (
                    <p className="text-xs text-amber-700">
                      Nothing on this receipt is accepted, so there is nothing to post.
                    </p>
                  )}
                </>
              )}

              {!posted && !cancelled && can.cancel && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                  <Ban className="h-3.5 w-3.5" />
                  Cancel receipt
                </Button>
              )}

              {!posted && !cancelled && !can.post && (
                <p className="text-xs text-slate-500">
                  You can see this receipt but not post it to stock.
                </p>
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

      {ledger.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stock ledger entries</CardTitle>
            <span className="text-xs text-slate-500">Written when this receipt was posted</span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {ledger.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-slate-700">{l.itemName}</span>
                  <span className="num text-xs text-slate-600">
                    +{qty(l.quantity, 3)} @ {money(l.rate, true)}
                    {can.viewValuation && ` = ${money(l.value)}`}
                    <span className="ml-2 text-slate-400">balance {qty(l.balanceQty, 3)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {inspecting && (
        <InspectModal
          grnId={grn.id}
          items={items}
          onClose={() => setInspecting(false)}
          onDone={(msg) => { setInspecting(false); setNotice(msg); router.refresh(); }}
        />
      )}

      {cancelling && (
        <CancelModal
          grnId={grn.id}
          grnNo={grn.grnNo}
          onClose={() => setCancelling(false)}
          onDone={(msg) => { setCancelling(false); setNotice(msg); router.refresh(); }}
        />
      )}
    </div>
  );
}

function InspectModal({
  grnId, items, onClose, onDone,
}: { grnId: string; items: Line[]; onClose: () => void; onDone: (m: string) => void }) {
  const [state, setState] = React.useState(() =>
    Object.fromEntries(
      items.map((l) => [
        l.id,
        { accepted: String(l.acceptedQty), rejected: String(l.rejectedQty), reason: l.rejectionReason ?? "" },
      ]),
    ),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const invalid = items.some((l) => {
    const s = state[l.id];
    return (Number(s.accepted) || 0) + (Number(s.rejected) || 0) > l.receivedQty + 0.0001;
  });

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await inspectGrnAction(
      grnId,
      items.map((l) => ({
        lineId: l.id,
        acceptedQty: Number(state[l.id].accepted) || 0,
        rejectedQty: Number(state[l.id].rejected) || 0,
        rejectionReason: state[l.id].reason || undefined,
      })),
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Inspection recorded.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record inspection"
      description="Only the accepted quantity will enter the stock ledger when this receipt is posted."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={invalid}>Save inspection</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {invalid && <Alert tone="error">Accepted plus rejected cannot exceed what was received.</Alert>}

        {items.map((l) => (
          <div key={l.id} className="rounded-md border border-slate-200 p-3">
            <p className="text-sm text-slate-800">{l.name}</p>
            <p className="mb-2 text-xs text-slate-500">
              Received {qty(l.receivedQty, 3)} {l.uom}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Accepted">
                <Input type="number" step="any" min={0} className="num text-right"
                  value={state[l.id].accepted}
                  onChange={(e) => setState((s) => ({ ...s, [l.id]: { ...s[l.id], accepted: e.target.value } }))} />
              </Field>
              <Field label="Rejected">
                <Input type="number" step="any" min={0} className="num text-right"
                  value={state[l.id].rejected}
                  onChange={(e) => setState((s) => ({ ...s, [l.id]: { ...s[l.id], rejected: e.target.value } }))} />
              </Field>
              <Field label="Reason">
                <Input value={state[l.id].reason}
                  disabled={(Number(state[l.id].rejected) || 0) <= 0}
                  onChange={(e) => setState((s) => ({ ...s, [l.id]: { ...s[l.id], reason: e.target.value } }))} />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CancelModal({
  grnId, grnNo, onClose, onDone,
}: { grnId: string; grnNo: string; onClose: () => void; onDone: (m: string) => void }) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelGrnAction(grnId, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Goods receipt cancelled.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${grnNo}`}
      description="Only an unposted receipt can be cancelled."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!remarks.trim()}>
            Cancel receipt
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
