"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { DetailAction, DetailScreen } from "@/components/shell/detail-screen";
import { cn } from "@/lib/utils";
import { addUomAction, createItemAction, updateItemAction } from "./actions";

export interface ItemFormValues {
  id: string; code: string; name: string; uomId: string;
  reorderLevel: string; specification: string; onHand: string;
}

const LABEL = "text-[11px] font-semibold text-navy-600";
const REQUIRED = <span className="text-bad-600">*</span>;
const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white";

/**
 * The design's item master form: the name, the unit it is transacted in — with
 * a new one addable in place — the stock it opens with, its reorder level and
 * its specification. The code is generated.
 */
export function ItemForm({
  units: initialUnits, item,
}: {
  units: Array<{ id: string; code: string; name: string }>;
  item?: ItemFormValues;
}) {
  const router = useRouter();
  const [units, setUnits] = React.useState(initialUnits);
  const [name, setName] = React.useState(item?.name ?? "");
  const [uomId, setUomId] = React.useState(item?.uomId ?? "");
  const [stock, setStock] = React.useState(item?.onHand ?? "");
  const [reorder, setReorder] = React.useState(item?.reorderLevel ?? "");
  const [spec, setSpec] = React.useState(item?.specification ?? "");
  const [newUnit, setNewUnit] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function addUnit() {
    const value = newUnit.trim();
    if (!value) return;
    const res = await addUomAction(value);
    if (!res.ok) { setError(res.error); return; }
    setUnits((us) => (us.some((u) => u.id === res.data.id) ? us : [...us, res.data]));
    setUomId(res.data.id);
    setNewUnit("");
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name,
      uomId,
      reorderLevel: Number(reorder) || 0,
      specification: spec,
      openingStock: item ? 0 : Number(stock) || 0,
    };
    if (item) {
      const res = await updateItemAction(item.id, payload);
      setBusy(false);
      if (!res.ok) { setError(res.error); return; }
      router.push(`/material/stock/${item.id}`);
      router.refresh();
      return;
    }
    const res = await createItemAction(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/material/stock/${res.data.id}`);
    router.refresh();
  }

  const ready = name.trim().length > 1 && Boolean(uomId);

  return (
    <DetailScreen
      backHref="/material/stock"
      title={item ? "Edit item master record" : "New item master record"}
      pills={
        item ? (
          <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
            {item.code}
          </span>
        ) : null
      }
      subtitle="Item code is generated automatically from the item name."
      actions={
        <DetailAction tone="primary" disabled={!ready || busy} onClick={save}>
            {item ? "Save item" : "Create item"}
          </DetailAction>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="max-w-[760px] rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Item details</div>

        <label className="block">
          <span className={LABEL}>Item name {REQUIRED}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="OPC 53 Cement"
            className={FIELD}
          />
        </label>

        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className="block">
              <span className={LABEL}>Unit of measure {REQUIRED}</span>
              <select value={uomId} onChange={(e) => setUomId(e.target.value)} className={FIELD}>
                <option value="">Select unit…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="Add a new unit"
                className="min-w-0 flex-1 rounded-[9px] border border-line-400 bg-white px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={addUnit}
                className="shrink-0 cursor-pointer rounded-[9px] border border-line-400 bg-white px-3.5 py-2.5 text-[12px] font-bold text-brand-700 transition-colors hover:border-brand-500"
              >
                + Add
              </button>
            </div>
          </div>

          <label className="block">
            <span className={LABEL}>Available stock</span>
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value.replace(/[^\d.]/g, ""))}
              disabled={Boolean(item)}
              placeholder="220"
              className={cn(FIELD, item && "cursor-not-allowed opacity-60")}
            />
            {item && (
              <span className="mt-1 block text-[11px] font-medium text-muted-400">
                Stock moves through receipts and issues, never by editing the item.
              </span>
            )}
          </label>

          <label className="block">
            <span className={LABEL}>Reorder level</span>
            <input
              value={reorder}
              onChange={(e) => setReorder(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="400"
              className={FIELD}
            />
          </label>
        </div>

        <label className="mt-3.5 block">
          <span className={LABEL}>Specification</span>
          <textarea
            rows={3}
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="IS 269 grade 53, 50 kg bag"
            className={cn(FIELD, "resize-y")}
          />
        </label>
      </div>
    </DetailScreen>
  );
}
