"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { deleteMasterAction } from "@/app/(app)/masters/actions";
import {
  DetailAction, DetailActionLink, DetailScreen, Fact, PanelCard, SummaryCard, TD, TH,
} from "@/components/shell/detail-screen";
import { cn } from "@/lib/utils";

export interface Movement {
  id: string;
  kind: "RECEIPT" | "ISSUE" | "RETURN" | "TRANSFER" | "OTHER";
  tag: string;
  qty: string;
  at: string;
  by: string;
  to: string;
  ref: string;
  note: string;
}

const TAG_TONE = {
  RECEIPT: { pill: "bg-good-050 text-good-700", qty: "text-good-700" },
  ISSUE: { pill: "bg-bad-050 text-bad-700", qty: "text-bad-700" },
  RETURN: { pill: "bg-brand-100 text-brand-700", qty: "text-brand-700" },
  TRANSFER: { pill: "bg-[#EFE9FC] text-[#6A46C8]", qty: "text-[#6A46C8]" },
  OTHER: { pill: "bg-surface-field text-navy-500", qty: "text-navy-500" },
} as const;

const TABS: Array<[string, string]> = [
  ["all", "All"],
  ["RECEIPT", "Received"],
  ["ISSUE", "Issued"],
  ["RETURN", "Returned"],
  ["TRANSFER", "Transfers"],
];

export function ItemDetail({
  item, movements, can,
}: {
  item: {
    id: string; name: string; code: string; unit: string;
    stock: string; reorder: string; spec: string;
    flag: "RESTOCK NOW" | "ORDER SOON" | "HEALTHY";
    gap: string; barPct: number;
    receivedTotal: string; issuedTotal: string;
  };
  movements: Movement[];
  can: { raiseIndent: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState("all");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const shown = tab === "all" ? movements : movements.filter((m) => m.kind === tab);

  const flagClass =
    item.flag === "RESTOCK NOW" ? "bg-bad-600" : item.flag === "ORDER SOON" ? "bg-[#E8A13A]" : "bg-good-600";
  const barClass =
    item.flag === "RESTOCK NOW"
      ? "bg-[linear-gradient(90deg,#D8494A,#E8827F)]"
      : item.flag === "ORDER SOON"
        ? "bg-[linear-gradient(90deg,#E8A13A,#F2C063)]"
        : "bg-[linear-gradient(90deg,#1F9D66,#5BC8A2)]";

  async function remove() {
    setBusy(true);
    const res = await deleteMasterAction("items", item.id);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/material/stock");
  }

  return (
    <DetailScreen
      backHref="/material/stock"
      title={item.name}
      pills={
        <>
          <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
            {item.code}
          </span>
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-[5px] text-[9px] font-extrabold uppercase tracking-[.08em] text-white",
              flagClass,
            )}
          >
            {item.flag}
          </span>
        </>
      }
      subtitle={`${item.stock} ${item.unit} in stock · reorder at ${item.reorder} ${item.unit}`}
      actions={
        <>
          {can.raiseIndent && (
            <DetailActionLink tone="soft" href={`/material/indents/new?item=${item.id}`}>
              → Raise indent
            </DetailActionLink>
          )}
          {can.delete && (
            <DetailAction tone="danger" onClick={() => setConfirming(true)}>🗑 Delete</DetailAction>
          )}
          {can.update && (
            <DetailActionLink tone="primary" href={`/material/stock/${item.id}/edit`}>✎ Edit</DetailActionLink>
          )}
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
        <SummaryCard label="Item details">
          <div className="grid grid-cols-2 gap-3.5">
            <Fact label="Item code">{item.code}</Fact>
            <Fact label="Unit of measure">{item.unit}</Fact>
            <Fact label="Available stock">{item.stock} {item.unit}</Fact>
            <Fact label="Reorder level">{item.reorder} {item.unit}</Fact>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Specification</div>
              <div className="mt-[3px] text-[12.5px] font-medium text-navy-900">{item.spec}</div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Stock position">
          <div className="flex flex-wrap items-baseline gap-[9px]">
            <span className="font-display text-[26px] font-extrabold text-navy-950">{item.stock}</span>
            <span className="text-[13px] font-semibold text-muted-600">{item.unit}</span>
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-[5px] text-[9px] font-extrabold uppercase tracking-[.08em] text-white",
                flagClass,
              )}
            >
              {item.flag}
            </span>
          </div>
          <div className="mt-2.5 h-[9px] overflow-hidden rounded-full bg-line-200">
            <div className={cn("h-full rounded-full", barClass)} style={{ width: `${item.barPct}%` }} />
          </div>
          <div className="mt-[9px] text-[12px] font-semibold text-navy-500">{item.gap}</div>
          <div className="mt-[5px] text-[11.5px] font-medium text-muted-400">
            Stock rises automatically when a GRN is received against a purchase order for this item.
          </div>
        </SummaryCard>
      </div>

      <PanelCard
        title="Transaction history"
        subtitle={`${movements.length} ${movements.length === 1 ? "transaction" : "transactions"} · received ${item.receivedTotal} · issued ${item.issuedTotal}`}
        right={
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "cursor-pointer rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold transition-colors",
                  tab === key
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 && (
          <div className="px-7 py-7 text-center text-[12.5px] font-medium text-muted-400">
            No movements of this kind recorded for this item
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Movement</th>
                <th className={cn(TH, "text-right")}>Qty</th>
                <th className={cn(TH, "text-left")}>Date &amp; time</th>
                <th className={cn(TH, "text-left")}>Handled by</th>
                <th className={cn(TH, "text-left")}>From / to</th>
                <th className={cn(TH, "text-left")}>Reference</th>
                <th className={cn(TH, "text-left")}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="hover:bg-surface-tint">
                  <td className={TD}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-[10px] py-[5px] text-[9px] font-bold tracking-[.07em]",
                        TAG_TONE[m.kind].pill,
                      )}
                    >
                      {m.tag}
                    </span>
                  </td>
                  <td className={cn(TD, "text-right")}>
                    <span className={cn("font-display text-[13.5px] font-extrabold", TAG_TONE[m.kind].qty)}>
                      {m.qty}
                    </span>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-[12px] font-semibold text-navy-900")}>{m.at}</td>
                  <td className={cn(TD, "text-[12px] font-semibold text-navy-600")}>{m.by}</td>
                  <td className={cn(TD, "text-[12px] font-medium text-navy-500")}>{m.to}</td>
                  <td className={cn(TD, "text-[12px] font-bold text-brand-700")}>{m.ref}</td>
                  <td className={cn(TD, "text-[11.5px] font-medium text-muted-400")}>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line-200 px-5 py-3.5 text-[11.5px] font-medium text-muted-400">
          Receipts are posted automatically from GRNs against purchase orders; issues, returns and
          transfers are booked by the store team against an indent.
        </div>
      </PanelCard>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${item.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the item from the master. It cannot be undone.
        </p>
      </Modal>
    </DetailScreen>
  );
}
