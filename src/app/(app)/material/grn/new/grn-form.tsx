"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { money, qty } from "@/lib/utils";
import { createGrnAction } from "../actions";

interface PoLine {
  poItemId: string; itemId: string; code: string; name: string; uom: string;
  orderedQty: number; alreadyReceived: number; rate: number;
}

interface LineState {
  receivedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  rejectionReason: string;
}

export function GrnForm({
  po, stores, lines,
}: {
  po: { id: string; poNo: string; vendorName: string; projectCode: string; projectName: string };
  stores: Array<{ id: string; name: string; code: string }>;
  lines: PoLine[];
}) {
  const router = useRouter();
  const [storeId, setStoreId] = React.useState(stores[0]?.id ?? "");
  const [challanNo, setChallanNo] = React.useState("");
  const [challanDate, setChallanDate] = React.useState("");
  const [vehicleNo, setVehicleNo] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Default each line to the full outstanding quantity, all accepted.
  const [state, setState] = React.useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => {
        const outstanding = Math.max(0, l.orderedQty - l.alreadyReceived);
        return [
          l.poItemId,
          {
            receivedQty: String(outstanding),
            acceptedQty: String(outstanding),
            rejectedQty: "0",
            rejectionReason: "",
          },
        ];
      }),
    ),
  );

  function update(poItemId: string, patch: Partial<LineState>) {
    setState((s) => ({ ...s, [poItemId]: { ...s[poItemId], ...patch } }));
  }

  /** Changing received keeps accepted in step unless it was deliberately reduced. */
  function onReceivedChange(line: PoLine, value: string) {
    const current = state[line.poItemId];
    const wasFullyAccepted = Number(current.acceptedQty) === Number(current.receivedQty);
    update(line.poItemId, {
      receivedQty: value,
      ...(wasFullyAccepted ? { acceptedQty: value } : {}),
    });
  }

  const rows = lines.map((l) => {
    const s = state[l.poItemId];
    const outstanding = Math.max(0, l.orderedQty - l.alreadyReceived);
    const received = Number(s.receivedQty) || 0;
    const accepted = Number(s.acceptedQty) || 0;
    const rejected = Number(s.rejectedQty) || 0;
    const short = Math.max(0, outstanding - received);
    const overReceived = received > outstanding + 0.0001;
    const overAllocated = accepted + rejected > received + 0.0001;
    return { line: l, s, outstanding, received, accepted, rejected, short, overReceived, overAllocated };
  });

  const acceptedValue = rows.reduce((sum, r) => sum + r.accepted * r.line.rate, 0);
  const hasError = rows.some((r) => r.overReceived || r.overAllocated);
  const anyReceived = rows.some((r) => r.received > 0);

  async function save() {
    setBusy(true);
    setError(null);

    const res = await createGrnAction({
      poId: po.id,
      storeId,
      challanNo: challanNo || undefined,
      challanDate: challanDate || undefined,
      vehicleNo: vehicleNo || undefined,
      remarks: remarks || undefined,
      items: rows
        .filter((r) => r.received > 0)
        .map((r) => ({
          poItemId: r.line.poItemId,
          itemId: r.line.itemId,
          receivedQty: r.received,
          acceptedQty: r.accepted,
          rejectedQty: r.rejected,
          shortQty: r.short,
          rate: r.line.rate,
          rejectionReason: r.s.rejectionReason || undefined,
        })),
    });

    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/grn/${res.data.id}`);
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Alert tone="info" title={`Receiving against ${po.poNo}`}>
        {po.vendorName} · {po.projectCode} — {po.projectName}. Only the quantity you mark accepted
        will enter the stock ledger when this receipt is posted.
      </Alert>

      <Card>
        <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Receiving store" required>
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
                {stores.length === 0 && <option value="">No store configured</option>}
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Challan number">
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="DC-4471" />
            </Field>
            <Field label="Challan date">
              <Input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
            </Field>
            <Field label="Vehicle number">
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="KA 01 AB 1234" className="uppercase" />
            </Field>
            <Field label="Remarks" className="sm:col-span-2 lg:col-span-4">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </Field>
          </div>
          <p className="mt-3 border-t border-line-200 pt-3 text-xs text-muted-500">
            Challan photo capture arrives with the mobile app and the storage integration; the field
            is already on the record.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What arrived</CardTitle>
          <span className="text-xs text-muted-500">Accepted + rejected cannot exceed received</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {rows.map(({ line, s, outstanding, short, overReceived, overAllocated }) => (
            <div
              key={line.poItemId}
              className={`rounded-md border p-3 ${overReceived || overAllocated ? "border-bad-600 bg-bad-050" : "border-line-400"}`}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-navy-900">{line.name}</p>
                  <p className="text-xs text-muted-500">
                    <code>{line.code}</code> · ordered {qty(line.orderedQty, 3)} {line.uom}
                    {line.alreadyReceived > 0 && ` · already received ${qty(line.alreadyReceived, 3)}`}
                    {" · "}outstanding <span className="font-medium">{qty(outstanding, 3)}</span>
                  </p>
                </div>
                <span className="num text-xs text-muted-500">{money(line.rate, true)} / {line.uom}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-12">
                <Field label="Received" className="sm:col-span-2">
                  <Input type="number" step="any" min={0} value={s.receivedQty}
                    onChange={(e) => onReceivedChange(line, e.target.value)} className="num text-right" />
                </Field>
                <Field label="Accepted" className="sm:col-span-2">
                  <Input type="number" step="any" min={0} value={s.acceptedQty}
                    onChange={(e) => update(line.poItemId, { acceptedQty: e.target.value })} className="num text-right" />
                </Field>
                <Field label="Rejected" className="sm:col-span-2">
                  <Input type="number" step="any" min={0} value={s.rejectedQty}
                    onChange={(e) => update(line.poItemId, { rejectedQty: e.target.value })} className="num text-right" />
                </Field>
                <Field label="Short" className="sm:col-span-2">
                  <div className="num flex h-9 items-center justify-end rounded-md bg-surface-sunken px-3 text-sm text-navy-600">
                    {qty(short, 3)}
                  </div>
                </Field>
                <Field label="Rejection reason" className="sm:col-span-4">
                  <Input value={s.rejectionReason}
                    onChange={(e) => update(line.poItemId, { rejectionReason: e.target.value })}
                    placeholder={Number(s.rejectedQty) > 0 ? "Why was it rejected?" : "—"}
                    disabled={Number(s.rejectedQty) <= 0} />
                </Field>
              </div>

              {overReceived && (
                <p className="mt-2 text-xs text-bad-600">
                  Receiving more than the {qty(outstanding, 3)} outstanding on this PO line.
                </p>
              )}
              {overAllocated && (
                <p className="mt-2 text-xs text-bad-600">
                  Accepted plus rejected is more than what was received.
                </p>
              )}
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 border-t border-line-400 pt-3">
            <span className="text-sm text-muted-500">Value of accepted stock</span>
            <span className="num text-lg font-semibold text-navy-950">{money(acceptedValue)}</span>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {hasError && <Badge tone="bad">Fix the highlighted lines</Badge>}
        {!anyReceived && !hasError && <Badge tone="slate">Enter what was received</Badge>}
        <Button onClick={save} loading={busy} disabled={hasError || !anyReceived || !storeId}>
          <PackageCheck className="h-3.5 w-3.5" />
          Record goods receipt
        </Button>
      </div>
    </div>
  );
}
