"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/primitives";
import { DetailAction, DetailScreen, PanelCard } from "@/components/shell/detail-screen";
import { cn, money, qty } from "@/lib/utils";
import { poTotals, priceLine } from "@/lib/material/procurement";
import { createPurchaseOrderAction, updatePurchaseOrderAction } from "../actions";

interface ItemOpt {
  id: string; code: string; name: string; uom: string; onHand: number; standardRate: number; taxPct: number;
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
  projects, vendors, items, openIndents, prefill, edit, startWithVendorId,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  vendors: Array<{ id: string; name: string; paymentTermId: string | null }>;
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
  // The design's builder has no other-charges field; an edited order keeps what it had.
  const otherCharges = String(init?.otherCharges ?? 0);
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
    if (!prefill?.lines.length) return [];
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

  const [pick, setPick] = React.useState("");

  // What is left to add, narrowed by the search box.
  const pool = items.filter(
    (i) =>
      !lines.some((l) => l.itemId === i.id) &&
      (!pick.trim() || `${i.name} ${i.code}`.toLowerCase().includes(pick.trim().toLowerCase())),
  );

  function addItem(item: ItemOpt) {
    setLines((ls) => [
      ...ls,
      {
        key: item.id, receivedQty: 0, itemId: item.id, orderedQty: "",
        rate: String(item.standardRate), discountPct: "0", taxPct: String(item.taxPct),
        specification: "",
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
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

  // With nothing priced yet the label shows the standard rate, as the design does.
  const taxPct = subTotal > 0 ? Math.round((taxAmount / subTotal) * 100) : 18;

  return (
    <DetailScreen
      backHref="/material/purchase-orders"
      title={edit ? "Edit purchase order" : "Raise purchase order"}
      subtitle="Raised POs go to Project Manager, then Admin."
      actions={
        <>
          <DetailAction tone="plain" onClick={() => router.push("/material/purchase-orders")}>Cancel</DetailAction>
          <DetailAction tone="primary" disabled={!ready || busy} onClick={() => save(true)}>
            {edit ? "Save order" : "Raise PO & send for approval"}
          </DetailAction>
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Order details</div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Vendor {REQUIRED}</span>
              <select
                value={vendorId}
                onChange={(e) => onVendorChange(e.target.value)}
                className={cn(FIELD, "mt-1.5")}
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={LABEL}>Against indents</span>
                <span className="rounded-full bg-brand-100 px-2 py-[3px] text-[9.5px] font-bold text-brand-700">
                  {prefill ? `linked to ${prefill.indentNo}` : "Optional — none linked"}
                </span>
              </div>
              <div className="mt-1.5 max-h-[120px] space-y-1.5 overflow-y-auto">
                {openIndents.length === 0 && (
                  <div className="text-[11.5px] font-medium text-muted-400">No approved indents waiting.</div>
                )}
                {openIndents.slice(0, 12).map((i) => (
                  <a
                    key={i.id}
                    href={`/material/purchase-orders/new?indent=${i.id}`}
                    className={cn(
                      "block rounded-[9px] border px-3 py-2 transition-colors",
                      prefill?.indentId === i.id
                        ? "border-brand-500 bg-brand-100"
                        : "border-line-300 bg-surface-sunken hover:border-brand-500",
                    )}
                  >
                    <div className="text-[12px] font-bold text-navy-950">{i.indentNo}</div>
                    {i.purpose && (
                      <div className="mt-0.5 text-[11px] font-medium text-muted-400">{i.purpose}</div>
                    )}
                  </a>
                ))}
              </div>
            </div>

            <label className="block">
              <span className={LABEL}>Project</span>
              {edit ? (
                <input value={edit.projectLabel} readOnly className={cn(FIELD, "mt-1.5")} />
              ) : (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(FIELD, "mt-1.5")}
                >
                  {projects.length === 0 && <option value="">No projects mapped to you</option>}
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </label>

            <label className="block">
              <span className={LABEL}>Delivery due</span>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={cn(FIELD, "mt-1.5")}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className={LABEL}>Remarks</span>
              <textarea
                rows={3}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="e.g. deliver in two lots, unload at basement gate…"
                className={cn(FIELD, "mt-1.5 resize-y")}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className={LABEL}>Payment &amp; delivery terms</span>
              <input
                value={poTerms}
                onChange={(e) => setPoTerms(e.target.value)}
                placeholder="30 days credit · delivery at site"
                className={cn(FIELD, "mt-1.5")}
              />
            </label>
          </div>
        </div>

        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Add items from item master
          </div>
          <input
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder="Search item name or code…"
            className={FIELD}
          />
          <div className="mt-2.5 max-h-[280px] overflow-y-auto">
            {pool.slice(0, 40).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => addItem(i)}
                className="flex w-full cursor-pointer items-center gap-2 border-b border-line-100 px-1 py-2.5 text-left last:border-0 hover:bg-surface-tint"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-navy-900">{i.name}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                    {i.code} · {qty(i.onHand, 3)} {i.uom} in stock
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] font-bold text-brand-700">+ Add</span>
              </button>
            ))}
            {pool.length === 0 && (
              <div className="py-4 text-center text-[12px] font-medium text-muted-400">
                No matching items left to add
              </div>
            )}
          </div>
        </div>
      </div>

      <PanelCard
        title="Order lines"
        right={
          <span className="text-[11.5px] font-semibold text-muted-600">
            {lines.length} {lines.length === 1 ? "item" : "items"}
          </span>
        }
      >
        {lines.length === 0 ? (
          <div className="px-7 py-8 text-center">
            <div className="text-[12.5px] font-semibold text-muted-600">
              No items yet — pick them from the item master above
            </div>
            <div className="mt-1 text-[11.5px] font-medium text-muted-400">
              Add as many items as the order needs, then enter quantity and rate for each
            </div>
          </div>
        ) : (
          lines.map((l, i) => {
            const item = itemById.get(l.itemId);
            return (
              <div
                key={l.key}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-100 px-5 py-3.5 last:border-0"
              >
                <div className="min-w-[180px] flex-[1_1_220px]">
                  <div className="text-[12.5px] font-semibold text-navy-900">{item?.name ?? "—"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-400">
                    <span>{item?.code ?? ""}</span>
                    {prefill && (
                      <span className="rounded-full bg-surface-field px-2 py-[2px] text-[10px] font-semibold text-navy-500">
                        from {prefill.indentNo}
                      </span>
                    )}
                  </div>
                </div>
                <label className="block w-[120px]">
                  <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">
                    Qty · {item?.uom ?? ""}
                  </span>
                  <input
                    value={l.orderedQty}
                    onChange={(e) => updateLine(l.key, { orderedQty: e.target.value.replace(/[^\d.]/g, "") })}
                    placeholder="0"
                    className={cn(FIELD, "mt-1 py-2")}
                  />
                </label>
                <label className="block w-[120px]">
                  <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Rate ₹</span>
                  <input
                    value={l.rate}
                    onChange={(e) => updateLine(l.key, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                    placeholder="0"
                    className={cn(FIELD, "mt-1 py-2")}
                  />
                </label>
                <div className="w-[120px]">
                  <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Amount</div>
                  <div className="mt-1 text-[12.5px] font-bold text-navy-950">{money(computed[i]?.total ?? 0)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="ml-auto shrink-0 cursor-pointer rounded-[7px] border border-bad-100 bg-bad-050 px-3 py-1.5 text-[11px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
                >
                  Remove
                </button>
              </div>
            );
          })
        )}

        <div className="flex flex-wrap justify-end gap-[34px] bg-surface-sunken px-5 py-4">
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-muted-400">Subtotal</div>
            <div className="mt-[3px] text-[14px] font-bold text-navy-600">{money(subTotal)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-muted-400">GST {taxPct}%</div>
            <div className="mt-[3px] text-[14px] font-bold text-navy-600">{money(taxAmount)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-navy-800">PO value</div>
            <div className="mt-[3px] font-display text-[20px] font-extrabold text-navy-950">{money(grandTotal)}</div>
          </div>
        </div>
      </PanelCard>
    </DetailScreen>
  );
}

const LABEL = "text-[11px] font-semibold text-navy-600";
const REQUIRED = <span className="text-bad-600">*</span>;
const FIELD =
  "w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white";
