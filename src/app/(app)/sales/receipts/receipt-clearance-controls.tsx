"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Can } from "@/components/rbac/can";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import { PERM } from "@/lib/permissions/codes";
import { money } from "@/lib/utils";
import { bounceReceiptAction, clearReceiptAction } from "./actions";

/**
 * Clear and Bounce for a cheque or DD awaiting the bank. Rendered only for a
 * receipt pending clearance; hidden without sales.receipt.clear — a courtesy,
 * since both actions authorize the same code.
 */
export function ReceiptClearanceControls({
  receiptId, receiptNo, mode, amount, receiptDay, today,
}: {
  receiptId: string;
  receiptNo: string;
  mode: string;
  amount: number;
  /** yyyy-mm-dd, the receipt's day in India time. */
  receiptDay: string;
  /** yyyy-mm-dd, computed once during data fetching. */
  today: string;
}) {
  const [open, setOpen] = React.useState<"clear" | "bounce" | null>(null);
  const router = useRouter();
  const close = React.useCallback(() => setOpen(null), []);

  function done() {
    setOpen(null);
    router.refresh();
  }

  return (
    <Can I={PERM.sales.receipt.clear}>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="success" onClick={() => setOpen("clear")}>Clear</Button>
        <Button size="xs" variant="ghost" onClick={() => setOpen("bounce")}>Bounce</Button>
      </div>
      {open === "clear" && (
        <ClearModal
          receiptId={receiptId} receiptNo={receiptNo} mode={mode}
          receiptDay={receiptDay} today={today} onClose={close} onDone={done}
        />
      )}
      {open === "bounce" && (
        <BounceModal
          receiptId={receiptId} receiptNo={receiptNo} mode={mode} amount={amount}
          onClose={close} onDone={done}
        />
      )}
    </Can>
  );
}

function ClearModal({
  receiptId, receiptNo, mode, receiptDay, today, onClose, onDone,
}: {
  receiptId: string; receiptNo: string; mode: string; receiptDay: string; today: string;
  onClose: () => void; onDone: () => void;
}) {
  const [clearedOn, setClearedOn] = React.useState(today);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await clearReceiptAction(receiptId, clearedOn);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${receiptNo} cleared`}
      description={`The bank has realised this ${mode}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={busy} disabled={!clearedOn}>Mark cleared</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Cleared on" required>
          <Input type="date" min={receiptDay} max={today} value={clearedOn} onChange={(e) => setClearedOn(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function BounceModal({
  receiptId, receiptNo, mode, amount, onClose, onDone,
}: {
  receiptId: string; receiptNo: string; mode: string; amount: number;
  onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await bounceReceiptAction(receiptId, reason);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record ${receiptNo} as bounced`}
      description={`The bank returned this ${mode}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!reason.trim()}>Record bounce</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="warn">
          {money(amount)} comes off the booking&apos;s collected amount and its demand. The receipt stays on record,
          marked bounced. This cannot be undone.
        </Alert>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder="e.g. Insufficient funds" />
        </Field>
      </div>
    </Modal>
  );
}
