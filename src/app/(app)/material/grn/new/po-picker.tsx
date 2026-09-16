"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DetailAction, DetailScreen, SoftPill } from "@/components/shell/detail-screen";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/material/po-display";

export interface PickablePo {
  id: string; poNo: string; status: string; vendor: string; items: string; value: string;
}

/**
 * The design's first step of a goods receipt: which approved order arrived.
 */
export function GrnPoPicker({ pos }: { pos: PickablePo[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");

  const shown = q.trim()
    ? pos.filter((p) => `${p.poNo} ${p.vendor} ${p.items}`.toLowerCase().includes(q.trim().toLowerCase()))
    : pos;

  return (
    <DetailScreen
      backHref="/material/grn"
      title="Receive goods · GRN"
      subtitle="Store team: pick the approved PO, enter what actually arrived — stock is received automatically."
      actions={
        <DetailAction tone="plain" onClick={() => router.push("/material/grn")}>Cancel</DetailAction>
      }
    >
      <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Against purchase order
          </span>
          <span className="rounded-full bg-good-050 px-2 py-[3px] text-[9.5px] font-bold text-good-700">
            approved POs only
          </span>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type the PO number — e.g. PO-2201"
          className="w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white"
        />

        <div className="mt-2.5 space-y-2">
          {shown.map((p) => (
            <Link
              key={p.id}
              href={`/material/grn/new?po=${p.id}`}
              className="flex items-center gap-3 rounded-[10px] border border-line-300 bg-surface-sunken px-3.5 py-3 transition-colors hover:border-brand-500 hover:bg-brand-100"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-extrabold text-navy-950">{p.poNo}</span>
                  <SoftPill tone={PO_STATUS_TONE[p.status] ?? "muted"} className="text-[9.5px]">
                    {PO_STATUS_LABEL[p.status] ?? p.status}
                  </SoftPill>
                </div>
                <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                  {p.vendor} · {p.items}
                </div>
              </div>
              <span className="shrink-0 text-[12.5px] font-bold text-brand-700">{p.value}</span>
            </Link>
          ))}
          {shown.length === 0 && (
            <div className="py-7 text-center text-[12.5px] font-medium text-muted-400">
              {pos.length === 0
                ? "No purchase orders awaiting delivery — material can only be received against an approved order."
                : "No order matches that."}
            </div>
          )}
        </div>
      </div>
    </DetailScreen>
  );
}
