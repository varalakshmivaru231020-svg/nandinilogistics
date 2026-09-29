"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import {
  DetailAction, DetailActionLink, DetailScreen, Fact, PanelCard, SoftPill,
  SummaryCard, TD, TH,
} from "@/components/shell/detail-screen";
import { cn, formatDate } from "@/lib/utils";
import { deleteGrnAction, addGrnAttachmentsAction, deleteGrnAttachmentAction } from "../actions";
import { FileChip } from "@/components/ui/file-tag";

interface Grn {
  id: string; grnNo: string; updatedAt: string;
  poId: string; poNo: string; vendor: string; receiver: string;
  match: string; matchTone: "good" | "warn" | "bad" | "muted";
  poValue: string; poDelivery: string; poApproved: string; poIndents: string;
  receivedAt: string; accepted: string; rejected: string; short: string;
  photo: string | null; remarks: string;
  invoiceNo: string | null;
}

interface Line {
  id: string; code: string; name: string;
  ordered: string; received: string; rejected: string;
  verdict: string; verdictTone: "good" | "warn" | "bad";
}

/** A file kept against the receipt — a challan, a slip, a photo. */
export interface GrnFile {
  id: string; fileName: string; fileSize: number; label: string | null;
  uploadedBy: string | null; uploadedAt: string;
}

export function GrnDetail({
  grn, lines, can, files,
}: {
  grn: Grn;
  lines: Line[];
  files: GrnFile[];
  can: { delete: boolean; update: boolean; attachInvoice: boolean };
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function removeFile(id: string) {
    setError(null);
    const res = await deleteGrnAttachmentAction(id);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await deleteGrnAction(grn.id, grn.updatedAt);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/material/grn");
  }

  return (
    <DetailScreen
      backHref="/material/grn"
      title={grn.grnNo}
      pills={<SoftPill tone={grn.matchTone}>{grn.match}</SoftPill>}
      subtitle={`Against ${grn.poNo} · ${grn.vendor} · received by ${grn.receiver}`}
      actions={
        <>
          <DetailActionLink tone="plain" href={`/material/purchase-orders/${grn.poId}`}>
            Open PO
          </DetailActionLink>
          {can.delete && (
            <DetailAction tone="danger" onClick={() => setConfirming(true)}>🗑 Delete</DetailAction>
          )}
          {can.update && (
            <DetailActionLink tone="primary" href={`/material/grn/${grn.id}/edit`}>✎ Edit</DetailActionLink>
          )}
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
        <SummaryCard label="Purchase order">
          <div className="grid grid-cols-2 gap-3.5">
            <Fact label="PO number">{grn.poNo}</Fact>
            <Fact label="Vendor">{grn.vendor}</Fact>
            <Fact label="PO value">{grn.poValue}</Fact>
            <Fact label="Delivery">{grn.poDelivery}</Fact>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">PO approved by</div>
              <div className="mt-[3px] text-[12.5px] font-semibold text-navy-900">{grn.poApproved}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Linked indents</div>
              <div className="mt-[3px] text-[12.5px] font-semibold text-navy-900">{grn.poIndents}</div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Receipt">
          <div className="grid grid-cols-2 gap-3.5">
            <Fact label="Received by">{grn.receiver}</Fact>
            <Fact label="Received at">{grn.receivedAt}</Fact>
            <Fact label="Accepted">{grn.accepted}</Fact>
            <Fact label="Rejected">{grn.rejected}</Fact>
            <Fact label="Short">{grn.short}</Fact>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Challan photo</div>
              {grn.photo ? (
                <div className="mt-[3px] text-[12.5px] font-bold text-good-700">✓ {grn.photo}</div>
              ) : (
                <div className="mt-[3px] text-[12.5px] font-medium text-muted-400">Not attached</div>
              )}
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Remarks</div>
              <div className="mt-[3px] text-[12.5px] font-medium text-navy-900">{grn.remarks}</div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Vendor invoice">
          {grn.invoiceNo ? (
            <div className="rounded-[9px] border border-[#9AD4B4] bg-good-050 px-3.5 py-3">
              <div className="text-[12.5px] font-bold text-good-700">✓ {grn.invoiceNo}</div>
              <div className="mt-[3px] text-[11.5px] font-medium text-good-700">
                Three-way match complete — PO ↔ GRN ↔ Invoice. Payment can be released.
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-[9px] border border-amber-200 bg-warn-050 px-3.5 py-3">
                <div className="text-[12.5px] font-bold text-warn-800">Invoice pending</div>
                <div className="mt-[3px] text-[11.5px] font-medium text-warn-800">
                  Goods are in store, but payment stays blocked until the vendor invoice is attached
                  and matched.
                </div>
              </div>
              {can.attachInvoice && (
                <a
                  href={`/material/invoices/new?po=${grn.poId}`}
                  className="mt-2.5 block w-full rounded-[9px] border border-dashed border-muted-200 bg-surface-sunken p-3.5 text-center text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:bg-[#F3F8FE] hover:text-brand-700"
                >
                  ↑ Attach invoice now
                </a>
              )}
            </>
          )}
        </SummaryCard>
      </div>

      <PanelCard
        title="Ordered vs received"
        right={<span className="text-[11.5px] font-semibold text-muted-600">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Sl</th>
                <th className={cn(TH, "text-left")}>Item</th>
                <th className={cn(TH, "text-right")}>Ordered</th>
                <th className={cn(TH, "text-right")}>Received</th>
                <th className={cn(TH, "text-right")}>Rejected</th>
                <th className={cn(TH, "text-left")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} className="hover:bg-surface-tint">
                  <td className={cn(TD, "text-[11.5px] font-semibold text-muted-400")}>{i + 1}</td>
                  <td className={TD}>
                    <div className="text-[12.5px] font-semibold text-navy-900">{l.name}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-muted-400">{l.code}</div>
                  </td>
                  <td className={cn(TD, "text-right text-[12px] font-semibold text-navy-600")}>{l.ordered}</td>
                  <td className={cn(TD, "text-right text-[12.5px] font-bold text-good-700")}>{l.received}</td>
                  <td className={cn(TD, "text-right text-[12.5px] font-bold text-bad-700")}>{l.rejected}</td>
                  <td className={TD}><SoftPill tone={l.verdictTone}>{l.verdict}</SoftPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard
        title="Attachments"
        subtitle="Challans, weighbridge slips and photos — add them as they arrive"
        right={can.update ? <AddFiles grnId={grn.id} onDone={() => router.refresh()} /> : null}
      >
        {files.length === 0 ? (
          <p className="px-5 py-6 text-center text-[12.5px] font-medium text-muted-400">
            Nothing attached yet. The challan and any slips can be added now or later.
          </p>
        ) : (
          <div className="flex flex-col">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3 last:border-0"
              >
                <FileChip fileName={f.fileName} />
                <span className="min-w-0 flex-1">
                  <a
                    href={`/api/material/grn/attachments/${f.id}`}
                    target="_blank"
                    rel="noopener"
                    className="block truncate text-[12.5px] font-semibold text-navy-900 hover:text-brand-500"
                  >
                    {f.fileName}
                  </a>
                  <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                    {f.label ? `${f.label} · ` : ""}
                    <span className="num">{Math.max(1, Math.round(f.fileSize / 1024))} KB</span>
                    {f.uploadedBy && ` · ${f.uploadedBy}`} · {formatDate(f.uploadedAt)}
                  </span>
                </span>
                <a
                  href={`/api/material/grn/attachments/${f.id}?download=1`}
                  className="rounded-[7px] border border-line-400 bg-white px-[11px] py-1.5 text-[10.5px] font-bold text-brand-700 transition-colors hover:border-brand-500"
                >
                  Download
                </a>
                {can.update && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="cursor-pointer rounded-[7px] border border-bad-100 bg-bad-050 px-[11px] py-1.5 text-[10.5px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${grn.grnNo}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the receipt. A receipt already in the stock ledger is corrected with a stock
          adjustment instead, never deleted.
        </p>
      </Modal>
    </DetailScreen>
  );
}

/**
 * Adding paperwork to a receipt that already exists. A label is offered because
 * "challan" and "weighbridge slip" are worth telling apart later.
 */
function AddFiles({ grnId, onDone }: { grnId: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addGrnAttachmentsAction(grnId, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    form.current?.reset();
    onDone();
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-wrap items-center gap-2">
      {error && <span className="text-[11px] font-semibold text-bad-600">{error}</span>}
      <input
        name="label"
        placeholder="Challan, slip, photo…"
        className="w-[150px] rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-[7px] text-[11.5px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
      />
      <label className="cursor-pointer rounded-[8px] border border-line-400 bg-white px-3 py-1.5 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-500">
        Choose files
        <input type="file" name="files" multiple className="hidden" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {busy && <span className="text-[11px] font-medium text-muted-500">Uploading…</span>}
    </form>
  );
}
