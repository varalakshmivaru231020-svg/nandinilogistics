"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, PackageCheck, Plus, Trash2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { transferEmpty, TRANSFER_STATUS_TONE } from "@/lib/screens/rows/material-rest";
import { formatDate, qty } from "@/lib/utils";
import { approveTransferAction, createTransferAction, receiveTransferAction } from "./actions";

interface Line {
  id: string; name: string; uom: string; quantity: number; receivedQty: number;
}

interface Transfer {
  id: string; transferNo: string; transferDate: string; status: string;
  fromStoreName: string; toStoreName: string; remarks: string | null; items: Line[];
}

interface StockRow {
  itemId: string; storeId: string; code: string; name: string; uom: string; available: number;
}



export function TransfersScreen({
  transfers, stores, stock, can, filtered = false,
}: {
  /** Whether search or filters are narrowing the list — changes the empty message. */
  filtered?: boolean;
  transfers: Transfer[];
  stores: Array<{ id: string; name: string }>;
  stock: StockRow[];
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [receiving, setReceiving] = React.useState<Transfer | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function approve(id: string) {
    setBusy(id);
    setError(null);
    const res = await approveTransferAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("Transfer approved — stock has left the source store."); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New transfer
          </Button>
        </div>
      )}

      {transfers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="h-8 w-8" />}
            title={transferEmpty(filtered).title}
            description={transferEmpty(filtered).description}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <Card key={t.id}>
              <CardBody className="p-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-navy-950">{t.transferNo}</span>
                      <Badge tone={TRANSFER_STATUS_TONE[t.status] ?? "slate"}>{t.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-500">
                      {t.fromStoreName} → {t.toStoreName} · {formatDate(t.transferDate)} · {t.items.length} line(s)
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {t.status === "DRAFT" && can.approve && (
                      <Button size="xs" variant="success" loading={busy === t.id} onClick={() => approve(t.id)}>
                        <Check className="h-3 w-3" />
                        Approve &amp; despatch
                      </Button>
                    )}
                    {t.status === "IN_TRANSIT" && can.receive && (
                      <Button size="xs" onClick={() => setReceiving(t)}>
                        <PackageCheck className="h-3 w-3" />
                        Receive
                      </Button>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-line-200 border-t border-line-200">
                  {t.items.map((l) => {
                    const short = t.status === "RECEIVED" && l.receivedQty < l.quantity;
                    return (
                      <li key={l.id} className="flex items-center justify-between px-4 py-1.5">
                        <span className="text-sm text-navy-600">{l.name}</span>
                        <span className="num text-xs text-muted-600">
                          {qty(l.quantity, 3)} {l.uom} sent
                          {t.status === "RECEIVED" && (
                            <span className={short ? "ml-2 font-medium text-bad-600" : "ml-2 text-good-700"}>
                              {qty(l.receivedQty, 3)} received{short && ` · ${qty(l.quantity - l.receivedQty, 3)} short`}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          stores={stores}
          stock={stock}
          onClose={() => setCreating(false)}
          onDone={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}

      {receiving && (
        <ReceiveModal
          transfer={receiving}
          onClose={() => setReceiving(null)}
          onDone={(m) => { setReceiving(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CreateModal({
  stores, stock, onClose, onDone,
}: {
  stores: Array<{ id: string; name: string }>;
  stock: StockRow[];
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [fromStoreId, setFromStoreId] = React.useState(stores[0]?.id ?? "");
  const [toStoreId, setToStoreId] = React.useState(stores[1]?.id ?? "");
  const [remarks, setRemarks] = React.useState("");
  const [lines, setLines] = React.useState<Array<{ key: string; itemId: string; quantity: string }>>([
    { key: "1", itemId: "", quantity: "" },
  ]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const available = stock.filter((s) => s.storeId === fromStoreId);
  const byItem = new Map(available.map((s) => [s.itemId, s]));

  const rows = lines.map((l) => {
    const s = byItem.get(l.itemId);
    const requested = Number(l.quantity) || 0;
    return { l, s, requested, over: s ? requested > s.available + 0.0001 : false };
  });
  const invalid = rows.some((r) => r.over);
  const ready = fromStoreId && toStoreId && fromStoreId !== toStoreId &&
    rows.some((r) => r.l.itemId && r.requested > 0) && !invalid;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createTransferAction({
      fromStoreId,
      toStoreId,
      remarks: remarks || undefined,
      items: rows.filter((r) => r.l.itemId && r.requested > 0).map((r) => ({ itemId: r.l.itemId, quantity: r.requested })),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(`Transfer ${res.data.transferNo} raised.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New store transfer"
      description="Stock moves only when the transfer is approved."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!ready}>Raise transfer</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From store" required>
            <Select value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="To store" required>
            <Select value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>

        {fromStoreId === toStoreId && (
          <Alert tone="error">Source and destination must be different stores.</Alert>
        )}

        {available.length === 0 ? (
          <Alert tone="warn">The source store has no stock to transfer.</Alert>
        ) : (
          <div className="space-y-2">
            {rows.map(({ l, s, over }, idx) => (
              <div key={l.key} className={`rounded-md border p-3 ${over ? "border-bad-600 bg-bad-050" : "border-line-400"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-500">Line {idx + 1}</span>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded p-1 text-muted-400 hover:bg-bad-050 hover:text-bad-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Item" className="sm:col-span-2">
                    <Select value={l.itemId}
                      onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, itemId: e.target.value } : x))}>
                      <option value="">Select…</option>
                      {available.map((a) => (
                        <option key={a.itemId} value={a.itemId}>
                          {a.code} — {a.name} ({qty(a.available, 3)} {a.uom})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Quantity${s ? ` (${s.uom})` : ""}`}>
                    <Input type="number" step="any" min={0} className="num text-right" value={l.quantity}
                      onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, quantity: e.target.value } : x))} />
                  </Field>
                </div>
                {over && s && <p className="mt-2 text-xs text-bad-600">Only {qty(s.available, 3)} available.</p>}
              </div>
            ))}
            <Button variant="secondary" size="sm"
              onClick={() => setLines((ls) => [...ls, { key: Math.random().toString(36).slice(2), itemId: "", quantity: "" }])}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </div>
        )}

        <Field label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function ReceiveModal({
  transfer, onClose, onDone,
}: { transfer: Transfer; onClose: () => void; onDone: (m: string) => void }) {
  const [state, setState] = React.useState(() =>
    Object.fromEntries(transfer.items.map((l) => [l.id, String(l.quantity)])),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const invalid = transfer.items.some((l) => (Number(state[l.id]) || 0) > l.quantity + 0.0001);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await receiveTransferAction(
      transfer.id,
      transfer.items.map((l) => ({ lineId: l.id, receivedQty: Number(state[l.id]) || 0 })),
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(res.data.shortfall > 0.0001 ? "Received with a shortfall — recorded on the audit trail." : "Transfer received in full.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive ${transfer.transferNo}`}
      description={`Arriving at ${transfer.toStoreName}. Record what actually turned up.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={invalid}>Confirm receipt</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {invalid && <Alert tone="error">You cannot receive more than what was sent.</Alert>}

        {transfer.items.map((l) => (
          <div key={l.id} className="rounded-md border border-line-400 p-3">
            <p className="text-sm text-navy-900">{l.name}</p>
            <p className="mb-2 text-xs text-muted-500">Sent {qty(l.quantity, 3)} {l.uom}</p>
            <Field label="Received">
              <Input type="number" step="any" min={0} className="num text-right"
                value={state[l.id]}
                onChange={(e) => setState((s) => ({ ...s, [l.id]: e.target.value }))} />
            </Field>
          </div>
        ))}
      </div>
    </Modal>
  );
}
