"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronDown, Printer, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, Field, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
import { unreturnedQty } from "@/lib/material/return-caps";
import { acknowledgeIssueAction, cancelIssueAction } from "./actions";

interface Line {
  id: string; name: string; uom: string; issuedQty: number; returnedQty: number; rate: number; value: number;
}

interface Issue {
  id: string; issueNo: string; issueDate: string; projectCode: string; storeName: string;
  workPackage: string | null; issuedByName: string; issuedToId: string; issuedToName: string;
  purpose: string | null; totalValue: number; acknowledgedAt: string | null;
  cancelledAt: string | null; cancelledByName: string | null; cancelReason: string | null;
  pendingReturns: number; lines: Line[];
}

export function IssuesScreen({
  issues, pendingAck, currentUserId, canAcknowledge, canCancel, canRaiseReturn, canViewValue, canPrint,
}: {
  issues: Issue[];
  pendingAck: number;
  currentUserId: string;
  canAcknowledge: boolean;
  canCancel: boolean;
  canRaiseReturn: boolean;
  canViewValue: boolean;
  canPrint: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState<Issue | null>(null);

  async function acknowledge(id: string) {
    setBusy(id);
    setError(null);
    const res = await acknowledgeIssueAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("Receipt acknowledged."); router.refresh(); }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {pendingAck > 0 && (
        <Alert tone="warn">
          {pendingAck} issue slip(s) are still waiting to be acknowledged by whoever received the
          material.
        </Alert>
      )}

      <div className="space-y-2">
        {issues.map((issue) => {
          const isOpen = open.has(issue.id);
          const mine = issue.issuedToId === currentUserId;
          const cancelled = Boolean(issue.cancelledAt);
          const returned = issue.lines.reduce((s, l) => s + l.returnedQty, 0);
          const outstanding = issue.lines.reduce((s, l) => s + unreturnedQty(l.issuedQty, l.returnedQty), 0);
          return (
            <Card key={issue.id}>
              <CardBody className="p-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(issue.id)) next.delete(issue.id);
                      else next.add(issue.id);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
                >
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-400 transition-transform", !isOpen && "-rotate-90")} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-sm font-medium text-navy-950", cancelled && "line-through decoration-muted-400")}>
                        {issue.issueNo}
                      </span>
                      <Badge tone="slate">{issue.projectCode}</Badge>
                      {cancelled ? (
                        <Badge tone="bad">Cancelled</Badge>
                      ) : issue.acknowledgedAt ? (
                        <Badge tone="good">Acknowledged</Badge>
                      ) : (
                        <Badge tone="warn">Awaiting acknowledgement</Badge>
                      )}
                      {returned > 0 && <Badge tone="muted">Part returned</Badge>}
                      {issue.pendingReturns > 0 && (
                        <Badge tone="warn">{issue.pendingReturns} return(s) pending</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-500">
                      {issue.storeName} → {issue.issuedToName} · {formatDate(issue.issueDate)}
                      {issue.workPackage && ` · ${issue.workPackage}`}
                      {issue.purpose && ` · ${issue.purpose}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="num text-sm font-medium text-navy-900">
                      {canViewValue ? money(issue.totalValue) : `${issue.lines.length} line(s)`}
                    </p>
                    <p className="text-xs text-muted-400">issued by {issue.issuedByName}</p>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-line-200 px-4 py-3">
                    <ul className="divide-y divide-line-200">
                      {issue.lines.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="text-sm text-navy-600">{l.name}</span>
                          <span className="num text-xs text-muted-600">
                            {qty(l.issuedQty, 3)} {l.uom}
                            {canViewValue && ` @ ${money(l.rate, true)} = ${money(l.value)}`}
                            {l.returnedQty > 0 && (
                              <span className="ml-2 text-good-700">{qty(l.returnedQty, 3)} returned</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {cancelled && (
                      <div className="mt-3 border-t border-line-200 pt-3 text-xs text-bad-600">
                        Cancelled on {formatDate(issue.cancelledAt)}
                        {issue.cancelledByName && ` by ${issue.cancelledByName}`}
                        {issue.cancelReason && <span className="text-muted-600"> — {issue.cancelReason}</span>}
                        <p className="mt-0.5 text-muted-500">
                          What had not been returned went back into {issue.storeName} at the issue rate.
                        </p>
                      </div>
                    )}

                    {!cancelled && !issue.acknowledgedAt && !mine && (
                      <p className="mt-3 border-t border-line-200 pt-3 text-xs text-muted-500">
                        Only {issue.issuedToName} can acknowledge this slip — on the mobile app, at site.
                      </p>
                    )}

                    {!cancelled && issue.acknowledgedAt && (
                      <p className="mt-3 border-t border-line-200 pt-3 text-xs text-good-700">
                        Acknowledged on {formatDate(issue.acknowledgedAt)}.
                      </p>
                    )}

                    {(canPrint || (!cancelled && (
                      (canRaiseReturn && outstanding > 0) || canCancel || (canAcknowledge && mine && !issue.acknowledgedAt)
                    ))) && (
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line-200 pt-3">
                        {canPrint && (
                          <Link
                            href={`/print/issues/${issue.id}`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-400 px-3 text-xs font-medium text-navy-700 hover:bg-surface-hover"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print slip
                          </Link>
                        )}
                        {!cancelled && canRaiseReturn && outstanding > 0 && (
                          <Link
                            href={`/material/returns/new?issue=${issue.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-400 px-3 text-xs font-medium text-navy-700 hover:bg-surface-hover"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Raise return
                          </Link>
                        )}
                        {!cancelled && canCancel && (
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(issue)}>
                            <Ban className="h-3.5 w-3.5" />
                            Cancel issue
                          </Button>
                        )}
                        {!cancelled && canAcknowledge && mine && !issue.acknowledgedAt && (
                          <Button size="sm" variant="success" loading={busy === issue.id}
                            onClick={() => acknowledge(issue.id)}>
                            <Check className="h-3.5 w-3.5" />
                            Acknowledge receipt
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {cancelling && (
        <CancelIssueModal
          issue={cancelling}
          canViewValue={canViewValue}
          onClose={() => setCancelling(null)}
          onDone={(m) => { setCancelling(null); setError(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CancelIssueModal({
  issue, canViewValue, onClose, onDone,
}: { issue: Issue; canViewValue: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const putBack = issue.lines
    .map((l) => ({ ...l, quantity: unreturnedQty(l.issuedQty, l.returnedQty) }))
    .filter((l) => l.quantity > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelIssueAction(issue.id, reason);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(`${res.data.issueNo} cancelled — the unreturned material is back in ${issue.storeName}.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${issue.issueNo}`}
      description="Everything not yet returned goes back into the store at the rate it was issued at."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={submit} loading={busy}
            disabled={!reason.trim() || issue.pendingReturns > 0}>
            Cancel issue
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {issue.pendingReturns > 0 && (
          <Alert tone="warn">
            {issue.pendingReturns} return(s) against this issue are awaiting a decision. Approve or
            reject them first.
          </Alert>
        )}

        {putBack.length === 0 ? (
          <p className="text-sm text-muted-500">Everything on this slip has already been returned; no stock will move.</p>
        ) : (
          <ul className="divide-y divide-line-200 rounded-md border border-line-400">
            {putBack.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-navy-600">{l.name}</span>
                <span className="num text-xs text-muted-600">
                  +{qty(l.quantity, 3)} {l.uom}
                  {canViewValue && ` @ ${money(l.rate, true)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
