"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { deleteMasterAction } from "@/app/(app)/masters/actions";
import {
  DetailAction, DetailActionLink, DetailScreen, SoftPill,
} from "@/components/shell/detail-screen";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/material/po-display";

export function VendorDetail({
  vendor, rows, orders, can,
}: {
  vendor: {
    id: string; name: string; code: string; initials: string;
    active: boolean; rating: string; onTime: string | null; spend: string;
  };
  rows: Array<{ k: string; v: string }>;
  orders: Array<{ id: string; poNo: string; status: string; items: string; value: string }>;
  can: { raisePo: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    setBusy(true);
    const res = await deleteMasterAction("vendors", vendor.id);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/material/vendors");
  }

  return (
    <DetailScreen
      backHref="/material/vendors"
      title={
        <span className="flex items-center gap-[13px]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(140deg,#0089C9,#2F308C)] text-[14px] font-bold text-white">
            {vendor.initials}
          </span>
          {vendor.name}
        </span>
      }
      pills={
        <>
          <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
            {vendor.code}
          </span>
          <SoftPill tone={vendor.active ? "good" : "warn"}>{vendor.active ? "Active" : "Inactive"}</SoftPill>
        </>
      }
      subtitle={
        `Rating ${vendor.rating} · ` +
        (vendor.onTime ? `${vendor.onTime} on-time · ` : "on-time not measured yet · ") +
        `${vendor.spend} spend to date`
      }
      actions={
        <>
          {can.raisePo && (
            <DetailActionLink tone="soft" href={`/material/purchase-orders/new?vendor=${vendor.id}`}>
              → Raise PO
            </DetailActionLink>
          )}
          {can.delete && (
            <DetailAction tone="danger" onClick={() => setConfirming(true)}>🗑 Delete</DetailAction>
          )}
          {can.update && (
            <DetailActionLink tone="primary" href={`/material/vendors/${vendor.id}/edit`}>✎ Edit</DetailActionLink>
          )}
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Vendor details
          </div>
          {rows.map((r) => (
            <div key={r.k} className="border-b border-line-100 py-[9px] last:border-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">{r.k}</div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-navy-900">{r.v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
              Purchase orders
            </span>
            <span className="text-[11.5px] font-semibold text-muted-600">
              {orders.length} {orders.length === 1 ? "purchase order" : "purchase orders"}
            </span>
          </div>
          <div className="flex flex-col gap-[7px]">
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/material/purchase-orders/${o.id}`}
                className="flex w-full items-center gap-2.5 rounded-[9px] border border-line-300 bg-surface-sunken px-3 py-2.5 text-left transition-colors hover:border-brand-500 hover:bg-brand-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-extrabold text-navy-950">{o.poNo}</span>
                    <SoftPill tone={PO_STATUS_TONE[o.status] ?? "muted"} className="text-[9.5px]">
                      {PO_STATUS_LABEL[o.status] ?? o.status}
                    </SoftPill>
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">{o.items}</div>
                </div>
                <span className="shrink-0 text-[12px] font-bold text-brand-700">{o.value}</span>
              </Link>
            ))}
            {orders.length === 0 && (
              <div className="p-[18px] text-center text-[12px] font-medium text-muted-300">
                No purchase orders raised on this vendor yet
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${vendor.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the vendor from the master. It cannot be undone.
        </p>
      </Modal>
    </DetailScreen>
  );
}
