"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { approveIndentAction, rejectIndentAction } from "@/app/(app)/material/indents/actions";
import { approvePurchaseOrderAction } from "@/app/(app)/material/purchase-orders/actions";

export interface QueueRow {
  id: string;
  kind: "INDENT" | "PO";
  type: string;
  title: string;
  ref: string;
  project: string;
  by: string;
  value: string;
  age: string;
  ageDays: number;
  href: string;
  /** Which approval step this row is sitting on. */
  level: "PM" | "ADMIN" | null;
  canApprove: boolean;
  canReject: boolean;
}

const TYPE_TONE: Record<string, string> = {
  INDENT: "bg-warn-050 text-warn-700",
  PO: "bg-brand-100 text-brand-700",
};

/**
 * The approval queue from the design: a type chip, the document, its value and
 * age, and the two actions. Approve and reject call the same guarded server
 * actions the full screens use.
 */
export function ApprovalQueue({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<QueueRow | null>(null);

  async function approve(row: QueueRow) {
    setBusy(row.id);
    setError(null);
    const res =
      row.kind === "INDENT"
        ? await approveIndentAction(row.id, row.level ?? "PM", "Approved from the dashboard queue")
        : await approvePurchaseOrderAction(row.id, "Approved from the dashboard queue");
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="px-[18px] py-[26px] text-center text-[13px] font-semibold text-good-600">
        ✓ Queue clear — nothing waiting on you
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="px-[18px] pt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {rows.map((q) => (
        <div
          key={`${q.kind}-${q.id}`}
          className="flex flex-wrap items-center gap-[13px] border-b border-line-100 px-[18px] py-[13px] last:border-0"
        >
          <span
            className={cn(
              "rounded-full px-[10px] py-[3px] text-[10px] font-bold uppercase tracking-[.06em]",
              TYPE_TONE[q.kind],
            )}
          >
            {q.type}
          </span>

          <div className="min-w-[190px] flex-1">
            <Link
              href={q.href}
              className="block text-[13px] font-semibold text-navy-900 hover:text-brand-500"
            >
              {q.title}
            </Link>
            <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">
              {q.ref} · {q.project} · raised by {q.by}
            </p>
          </div>

          <div className="text-right">
            <div className="num text-[13px] font-bold text-navy-950">{q.value}</div>
            <div
              className={cn(
                "text-[11px] font-semibold",
                q.ageDays > 3 ? "text-bad-600" : q.ageDays > 1 ? "text-warn-700" : "text-muted-500",
              )}
            >
              {q.age}
            </div>
          </div>

          <div className="flex gap-1.5">
            {q.canApprove ? (
              <Button size="sm" variant="success" loading={busy === q.id} onClick={() => approve(q)}>
                Approve
              </Button>
            ) : (
              <span className="text-[11px] font-medium text-muted-400">Not yours to approve</span>
            )}
            {q.canReject && q.kind === "INDENT" && (
              <Button size="sm" variant="ghost" onClick={() => setRejecting(q)}>
                Reject
              </Button>
            )}
          </div>
        </div>
      ))}

      {rejecting && (
        <RejectModal
          row={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RejectModal({
  row,
  onClose,
  onDone,
}: {
  row: QueueRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await rejectIndentAction(row.id, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${row.ref}`}
      description="A reason is mandatory and stays on the approval trail."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!remarks.trim()}>
            Reject
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Reason" required>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
