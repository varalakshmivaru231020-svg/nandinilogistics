"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";
import { money, qty } from "@/lib/utils";
import { createVendorInvoiceAction } from "../actions";

interface PoLine {
  itemId: string; code: string; name: string; uom: string;
  orderedQty: number; receivedQty: number; poRate: number; taxPct: number;
}

export function InvoiceForm({
  po, lines,
}: {
  po: { id: string; poNo: string; vendorName: string; vendorGstin: string | null; projectCode: string };
  lines: PoLine[];
}) {
  const router = useRouter();
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Default to billing exactly what was received, at the PO rate — the matching case.
  const [state, setState] = React.useState(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.itemId,
        { qty: String(l.receivedQty), rate: String(l.poRate), taxPct: String(l.taxPct) },
      ]),
    ),
  );

  function update(itemId: string, patch: Partial<{ qty: string; rate: string; taxPct: string }>) {
    setState((s) => ({ ...s, [itemId]: { ...s[itemId], ...patch } }));
  }

  const rows = lines.map((l) => {
    const s = state[l.itemId];
    const billedQty = Number(s.qty) || 0;
    const rate = Number(s.rate) || 0;
    const taxPct = Number(s.taxPct) || 0;
    const net = billedQty * rate;
    const tax = (net * taxPct) / 100;
    const overBilled = billedQty > l.receivedQty + 0.0001;
    const overPriced = rate > l.poRate + 0.0001;
    return { l, s, billedQty, rate, taxPct, net, tax, overBilled, overPriced };
  });

  const subTotal = rows.reduce((s, r) => s + r.net, 0);
  const taxAmount = rows.reduce((s, r) => s + r.tax, 0);
  const willMismatch = rows.some((r) => r.overBilled || r.overPriced);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createVendorInvoiceAction({
      poId: po.id,
      invoiceNo,
      invoiceDate,
      remarks: remarks || undefined,
      items: rows
        .filter((r) => r.billedQty > 0)
        .map((r) => ({
          itemId: r.l.itemId,
          invoicedQty: r.billedQty,
          rate: r.rate,
          taxPct: r.taxPct,
        })),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/invoices/${res.data.id}`);
  }

  const ready = invoiceNo.trim() && invoiceDate && rows.some((r) => r.billedQty > 0);

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Alert tone="info" title={`Invoice against ${po.poNo}`}>
        {po.vendorName}
        {po.vendorGstin && ` · GSTIN ${po.vendorGstin}`} · {po.projectCode}. Quantities default to
        what was received and accepted, at the PO rate — change them only to reflect the actual bill.
      </Alert>

      {willMismatch && (
        <Alert tone="warn" title="This will be flagged as a mismatch">
          Something here bills more than was received, or above the PO rate. The invoice is still
          recorded, but it cannot be approved for payment without an explicit override.
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Invoice</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor invoice number" required>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2026-0412" />
            </Field>
            <Field label="Invoice date" required>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <span className="text-xs text-slate-500">Received quantity is the billing ceiling</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {rows.map(({ l, s, net, tax, overBilled, overPriced }) => (
            <div
              key={l.itemId}
              className={`rounded-md border p-3 ${overBilled || overPriced ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
            >
              <div className="mb-2">
                <p className="text-sm font-medium text-slate-800">{l.name}</p>
                <p className="text-xs text-slate-500">
                  <code>{l.code}</code> · ordered {qty(l.orderedQty, 3)} · received &amp; accepted{" "}
                  <span className="font-medium text-emerald-700">{qty(l.receivedQty, 3)}</span> {l.uom}
                  {" · PO rate "}{money(l.poRate, true)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-12">
                <Field label="Billed qty" className="sm:col-span-3">
                  <Input type="number" step="any" min={0} className="num text-right"
                    value={s.qty} onChange={(e) => update(l.itemId, { qty: e.target.value })} />
                </Field>
                <Field label="Rate (₹)" className="sm:col-span-3">
                  <Input type="number" step="any" min={0} className="num text-right"
                    value={s.rate} onChange={(e) => update(l.itemId, { rate: e.target.value })} />
                </Field>
                <Field label="GST %" className="sm:col-span-2">
                  <Input type="number" step="any" min={0} max={100} className="num text-right"
                    value={s.taxPct} onChange={(e) => update(l.itemId, { taxPct: e.target.value })} />
                </Field>
                <Field label="Line total" className="sm:col-span-4">
                  <div className="num flex h-9 items-center justify-end rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-800">
                    {money(net + tax)}
                  </div>
                </Field>
              </div>

              {overBilled && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                  <TriangleAlert className="h-3 w-3" />
                  Billing more than the {qty(l.receivedQty, 3)} received and accepted.
                </p>
              )}
              {overPriced && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <TriangleAlert className="h-3 w-3" />
                  Rate is above the PO rate of {money(l.poRate, true)}.
                </p>
              )}
            </div>
          ))}

          <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-end gap-3">
              <span className="text-slate-500">Sub-total</span>
              <span className="num w-36 text-right text-slate-800">{money(subTotal)}</span>
            </div>
            <div className="flex justify-end gap-3">
              <span className="text-slate-500">GST</span>
              <span className="num w-36 text-right text-slate-800">{money(taxAmount)}</span>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-2">
              <span className="font-medium text-slate-700">Invoice total</span>
              <span className="num w-36 text-right text-lg font-semibold text-slate-900">
                {money(subTotal + taxAmount)}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={busy} disabled={!ready}>
          <ReceiptText className="h-3.5 w-3.5" />
          Record invoice &amp; run match
        </Button>
      </div>
    </div>
  );
}
