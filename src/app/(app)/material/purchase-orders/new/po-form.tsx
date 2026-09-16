"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus, Save, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { money, qty } from "@/lib/utils";
import { poTotals, priceLine } from "@/lib/material/procurement";
import { createPurchaseOrderAction, updatePurchaseOrderAction } from "../actions";

interface ItemOpt {
  id: string; code: string; name: string; uom: string; standardRate: number; taxPct: number;
}

interface Line {
  key: string;
  /** Set for a line that already exists on the order being edited. */
  id?: string;
  receivedQty: number;
  itemId: string;
  orderedQty: string;
  rate: string;
  discountPct: string;
  taxPct: string;
  specification: string;
}

function blankLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    receivedQty: 0,
    itemId: "", orderedQty: "", rate: "", discountPct: "0", taxPct: "0", specification: "",
  };
}

/** An existing, unapproved order being edited in place. */
export interface PoEditState {
  poId: string;
  projectLabel: string;
  initial: {
    vendorId: string;
    paymentTermId: string;
    expectedDate: string;
    deliveryAddress: string;
    terms: string;
    otherCharges: number;
    lines: Array<{
      id: string; itemId: string; orderedQty: number; receivedQty: number;
      rate: number; discountPct: number; taxPct: number; specification: string;
    }>;
  };
}

export function PoForm({
  projects, vendors, terms, items, openIndents, prefill, edit, startWithVendorId,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  vendors: Array<{ id: string; name: string; paymentTermId: string | null }>;
  terms: Array<{ id: string; name: string }>;
  items: ItemOpt[];
  openIndents: Array<{ id: string; indentNo: string; purpose: string | null; projectId: string }>;
  prefill: { projectId: string; indentId: string; indentNo: string; lines: Array<{ itemId: string; qty: number; rate: number; specification: string }> } | null;
  /** Raised from a vendor's record: the order opens on that vendor. */
  startWithVendorId?: string;
  edit?: PoEditState;
}) {
  const router = useRouter();
  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const init = edit?.initial;

  const [projectId, setProjectId] = React.useState(prefill?.projectId ?? projects[0]?.id ?? "");
  const [vendorId, setVendorId] = React.useState(init?.vendorId ?? startWithVendorId ?? "");
  const [paymentTermId, setPaymentTermId] = React.useState(init?.paymentTermId ?? "");
  const [expectedDate, setExpectedDate] = React.useState(init?.expectedDate ?? "");
  const [deliveryAddress, setDeliveryAddress] = React.useState(init?.deliveryAddress ?? "");
  const [poTerms, setPoTerms] = React.useState(init?.terms ?? "");
  const [otherCharges, setOtherCharges] = React.useState(String(init?.otherCharges ?? 0));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [lines, setLines] = React.useState<Line[]>(() => {
    if (init) {
      return init.lines.map((l) => ({
        key: l.id,
        id: l.id,
        receivedQty: l.receivedQty,
        itemId: l.itemId,
        orderedQty: String(l.orderedQty),
        rate: String(l.rate),
        discountPct: String(l.discountPct),
        taxPct: String(l.taxPct),
        specification: l.specification,
      }));
    }
    if (!prefill?.lines.length) return [blankLine()];
    return prefill.lines.map((l) => ({
      key: Math.random().toString(36).slice(2),
      receivedQty: 0,
      itemId: l.itemId,
      orderedQty: String(l.qty),
      rate: String(l.rate),
      discountPct: "0",
      taxPct: String(items.find((i) => i.id === l.itemId)?.taxPct ?? 0),
      specification: l.specification,
    }));
  });

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = itemById.get(itemId);
    updateLine(key, {
      itemId,
      rate: item ? String(item.standardRate) : "",
      taxPct: item ? String(item.taxPct) : "0",
    });
  }

  // A vendor's default payment term fills in when they are chosen.
  function onVendorChange(id: string) {
    setVendorId(id);
    const term = vendors.find((v) => v.id === id)?.paymentTermId;
    if (term) setPaymentTermId(term);
  }

  // The same arithmetic the server stores, so the preview cannot drift from it.
  const numeric = lines.map((l) => ({
    orderedQty: Number(l.orderedQty) || 0,
    rate: Number(l.rate) || 0,
    discountPct: Number(l.discountPct) || 0,
    taxPct: Number(l.taxPct) || 0,
  }));
  const computed = numeric.map(priceLine);
  const { subTotal, taxAmount, totalAmount: grandTotal } = poTotals(numeric, Number(otherCharges) || 0);

  async function save(submit: boolean) {
    setBusy(true);
    setError(null);

    const header = {
      vendorId,
      paymentTermId: paymentTermId || undefined,
      expectedDate: expectedDate || undefined,
      deliveryAddress: deliveryAddress || undefined,
      terms: poTerms || undefined,
      otherCharges: Number(otherCharges) || 0,
    };
    const toPayload = (l: Line) => ({
      itemId: l.itemId,
      orderedQty: Number(l.orderedQty),
      rate: Number(l.rate) || 0,
      discountPct: Number(l.discountPct) || 0,
      taxPct: Number(l.taxPct) || 0,
      specification: l.specification || undefined,
    });

    if (edit) {
      // An existing line is never dropped silently — a blanked quantity is refused, not deleted.
      const res = await updatePurchaseOrderAction(edit.poId, {
        ...header,
        items: lines
          .filter((l) => l.id || (l.itemId && Number(l.orderedQty) > 0))
          .map((l) => ({ id: l.id, ...toPayload(l) })),
      });
      setBusy(false);
      if (!res.ok) setError(res.error);
      else {
        router.push(`/material/purchase-orders/${edit.poId}`);
        router.refresh();
      }
      return;
    }

    const res = await createPurchaseOrderAction(
      {
        projectId,
        ...header,
        items: lines
          .filter((l) => l.itemId && Number(l.orderedQty) > 0)
          .map((l) => ({ ...toPayload(l), indentId: prefill?.indentId })),
      },
      submit,
    );

    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/purchase-orders/${res.data.id}`);
  }

  const ready = (edit || projectId) && vendorId && lines.some((l) => l.itemId && Number(l.orderedQty) > 0);

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {prefill && (
        <Alert tone="info" title={`Pre-filled from indent ${prefill.indentNo}`}>
          Only the quantity left to purchase after the stock check has been carried over.
        </Alert>
      )}

      {!edit && !prefill && openIndents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Start from an approved indent</CardTitle>
            <span className="text-xs text-muted-500">{openIndents.length} waiting to be ordered</span>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {openIndents.slice(0, 8).map((i) => (
              <a
                key={i.id}
                href={`/material/purchase-orders/new?indent=${i.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-line-400 bg-white px-2.5 py-1.5 text-xs text-navy-600 hover:border-brand-300 hover:bg-brand-50"
              >
                <Link2 className="h-3 w-3 text-muted-400" />
                <span className="font-medium">{i.indentNo}</span>
                {i.purpose && <span className="text-muted-500">· {i.purpose}</span>}
              </a>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Order details</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required hint={edit ? "An order stays on the project it was raised for." : undefined}>
              {edit ? (
                <Input value={edit.projectLabel} disabled readOnly />
              ) : (
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  {projects.length === 0 && <option value="">No projects mapped to you</option>}
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              )}
            </Field>

            <Field label="Vendor" required>
              <Select value={vendorId} onChange={(e) => onVendorChange(e.target.value)} required>
                <option value="">Select a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>

            <Field label="Payment term">
              <Select value={paymentTermId} onChange={(e) => setPaymentTermId(e.target.value)}>
                <option value="">— Not specified —</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>

            <Field label="Expected delivery">
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </Field>

            <Field label="Delivery address" className="sm:col-span-2">
              <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2} placeholder="Site gate, contact person and phone" />
            </Field>

            <Field label="Terms & conditions" className="sm:col-span-2">
              <Textarea value={poTerms} onChange={(e) => setPoTerms(e.target.value)} rows={2} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setLines((l) => [...l, blankLine()])}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {lines.map((line, idx) => {
            const item = itemById.get(line.itemId);
            const c = computed[idx];
            const received = line.receivedQty > 0;
            return (
              <div key={line.key} className="rounded-md border border-line-400 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-500">
                    Line {idx + 1}
                    {received && ` · ${qty(line.receivedQty, 3)} already received`}
                  </span>
                  {lines.length > 1 && !received && (
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      className="rounded p-1 text-muted-400 hover:bg-bad-050 hover:text-bad-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <Field label="Item" required className="sm:col-span-4">
                    <Select value={line.itemId} disabled={received} onChange={(e) => onItemChange(line.key, e.target.value)}>
                      <option value="">Select an item…</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                    </Select>
                  </Field>

                  <Field label={`Qty${item ? ` (${item.uom})` : ""}`} required className="sm:col-span-2">
                    <Input type="number" step="any" min={line.receivedQty || 0} value={line.orderedQty}
                      onChange={(e) => updateLine(line.key, { orderedQty: e.target.value })} />
                  </Field>

                  <Field label="Rate (₹)" required className="sm:col-span-2">
                    <Input type="number" step="any" min={0} value={line.rate}
                      onChange={(e) => updateLine(line.key, { rate: e.target.value })} />
                  </Field>

                  <Field label="Disc %" className="sm:col-span-1">
                    <Input type="number" step="any" min={0} max={100} value={line.discountPct}
                      onChange={(e) => updateLine(line.key, { discountPct: e.target.value })} />
                  </Field>

                  <Field label="GST %" className="sm:col-span-1">
                    <Input type="number" step="any" min={0} max={100} value={line.taxPct}
                      onChange={(e) => updateLine(line.key, { taxPct: e.target.value })} />
                  </Field>

                  <Field label="Amount" className="sm:col-span-2">
                    <div className="num flex h-9 items-center justify-end rounded-md bg-surface-sunken px-3 text-sm font-medium text-navy-900">
                      {money(c.total)}
                    </div>
                  </Field>

                  <Field label="Specification" className="sm:col-span-12">
                    <Input value={line.specification}
                      onChange={(e) => updateLine(line.key, { specification: e.target.value })}
                      placeholder="Grade, make, size or any other requirement" />
                  </Field>
                </div>
              </div>
            );
          })}

          <div className="space-y-1 border-t border-line-400 pt-3">
            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-muted-500">Sub-total</span>
              <span className="num w-36 text-right text-navy-900">{money(subTotal)}</span>
            </div>
            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-muted-500">GST</span>
              <span className="num w-36 text-right text-navy-900">{money(taxAmount)}</span>
            </div>
            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-muted-500">Other charges</span>
              <Input
                type="number" step="any" min={0} value={otherCharges}
                onChange={(e) => setOtherCharges(e.target.value)}
                className="num w-36 text-right"
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line-400 pt-2">
              <span className="text-sm font-medium text-navy-600">Order total</span>
              <span className="num w-36 text-right text-lg font-semibold text-navy-950">{money(grandTotal)}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {!ready && <Badge tone="slate">Choose {edit ? "" : "a project, "}a vendor and at least one item</Badge>}
        {edit ? (
          <>
            <Button variant="secondary" onClick={() => router.push(`/material/purchase-orders/${edit.poId}`)} disabled={busy}>
              Discard changes
            </Button>
            <Button onClick={() => save(false)} loading={busy} disabled={!ready}>
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => save(false)} loading={busy} disabled={!ready}>
              Save as draft
            </Button>
            <Button onClick={() => save(true)} loading={busy} disabled={!ready}>
              <Send className="h-3.5 w-3.5" />
              Submit for approval
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
