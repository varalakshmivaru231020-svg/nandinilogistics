"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, qty } from "@/lib/utils";
import { approveReturnAction, deleteReturnAction, rejectReturnAction } from "../actions";

interface Return {
  id: string; returnNo: string; status: string; returnDate: string; reason: string | null;
  projectCode: string; storeName: string; issueNo: string; issueCancelled: boolean;
  raisedByName: string; decidedByName: string | null; decidedAt: string | null;
  decisionNote: string | null; totalValue: number;
}

interface Line {
  id: string; code: string; name: string; uom: string; quantity: number;
  issuedQty: number; returnedQty: number; rate: number; value: number;
  condition: string | null; remarks: string | null;
}

export function ReturnDetail({
  ret, lines, can,
}: { ret: Return; lines: Line[]; can: Record<string, boolean> }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pending = ret.status === "PENDING";
  const damaged = lines.filter((l) => l.condition === "Damaged").length;

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteReturnAction(ret.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push("/material/returns");
  }

  const columns: Column<Line>[] = [
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <div>
          <p className="text-sm text-navy-900">{l.name}</p>
          <p className="text-xs text-muted-500"><code>{l.code}</code></p>
        </div>
      ),
    },
    { key: "issued", header: "Issued", align: "right", className: "num", render: (l) => `${qty(l.issuedQty, 3)} ${l.uom}` },
    {
      key: "returnedSoFar", header: "Returned so far", align: "right", className: "num",
      render: (l) => qty(l.returnedQty, 3),
    },
    {
      key: "quantity", header: "This return", align: "right", className: "num",
      render: (l) => <span className="font-medium text-navy-950">{qty(l.quantity, 3)}</span>,
    },
    {
      key: "condition", header: "Condition",
      render: (l) => <Badge tone={l.condition === "Damaged" ? "bad" : "good"}>{l.condition ?? "Good"}</Badge>,
    },
    { key: "rate", header: "Issue rate", align: "right", className: "num", visible: can.viewValuation, render: (l) => money(l.rate, true) },
    { key: "value", header: "Value", align: "right", className: "num", visible: can.viewValuation, render: (l) => money(l.value) },
    { key: "remarks", header: "Remarks", render: (l) => <span className="text-xs text-muted-600">{l.remarks ?? "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {ret.status === "APPROVED" && (
        <Alert tone="success" title="Returned to stock">
          The returned quantity is back in {ret.storeName} at the rate it was issued at
          {damaged > 0 ? ", damaged lines included — their condition is recorded for the store." : "."}
        </Alert>
      )}
      {ret.status === "REJECTED" && (
        <Alert tone="error" title="Rejected">No stock moved. {ret.decisionNote}</Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Return details</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Against issue", ret.issueNo],
                ["Project", ret.projectCode],
                ["Returns into", ret.storeName],
                ["Raised by", ret.raisedByName],
                ["Raised on", formatDate(ret.returnDate)],
                ["Status", ret.status],
                ["Decided by", ret.decidedByName ?? "—"],
                ["Decided on", formatDate(ret.decidedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">
                    {label === "Against issue" && can.viewIssues ? (
                      <Link href={`/material/issues?q=${encodeURIComponent(ret.issueNo)}`} className="text-brand-600 hover:underline">
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                    {label === "Against issue" && ret.issueCancelled && (
                      <Badge tone="bad" className="ml-2">Cancelled</Badge>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {ret.reason && (
              <p className="mt-3 border-t border-line-200 pt-3 text-sm text-muted-600">
                <span className="text-xs text-muted-500">Reason: </span>{ret.reason}
              </p>
            )}
            {ret.decisionNote && ret.status !== "REJECTED" && (
              <p className="mt-2 text-sm text-muted-600">
                <span className="text-xs text-muted-500">Decision note: </span>{ret.decisionNote}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {can.viewValuation && (
              <div>
                <p className="text-xs text-muted-500">Value at issue rates</p>
                <p className="num text-2xl font-semibold text-navy-950">{money(ret.totalValue)}</p>
                {damaged > 0 && <p className="mt-0.5 text-xs text-bad-600">{damaged} line(s) marked damaged</p>}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
              {can.approve && (
                <>
                  <Button size="sm" variant="success" onClick={() => setDeciding("approve")}>
                    <Check className="h-3.5 w-3.5" />
                    Approve &amp; return to stock
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setDeciding("reject")}>
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </>
              )}
              {can.delete && (
                <Button size="sm" variant="ghost" onClick={remove} loading={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete return
                </Button>
              )}
              {pending && !can.approve && (
                <p className="text-xs text-muted-500">Waiting for the store to approve or reject this return.</p>
              )}
              {!pending && <p className="text-xs text-muted-500">This return is decided; nothing more can change.</p>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines ({lines.length})</CardTitle></CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} rows={lines} rowKey={(l) => l.id} dense />
        </CardBody>
      </Card>

      {deciding && (
        <DecisionModal
          ret={ret}
          mode={deciding}
          damaged={damaged}
          onClose={() => setDeciding(null)}
          onDone={(m) => { setDeciding(null); setError(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function DecisionModal({
  ret, mode, damaged, onClose, onDone,
}: {
  ret: Return; mode: "approve" | "reject"; damaged: number;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const approving = mode === "approve";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = approving ? await approveReturnAction(ret.id, note) : await rejectReturnAction(ret.id, note);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(approving ? `${ret.returnNo} approved — stock is back in ${ret.storeName}.` : `${ret.returnNo} rejected.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${approving ? "Approve" : "Reject"} ${ret.returnNo}`}
      description={
        approving
          ? `Every line goes back into ${ret.storeName} at its issue rate — damaged material included.`
          : "No stock moves. The site can raise a fresh return."
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant={approving ? "success" : "danger"} onClick={submit} loading={busy}
            disabled={!approving && !note.trim()}>
            {approving ? "Approve return" : "Reject return"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {approving && damaged > 0 && (
          <Alert tone="warn">{damaged} line(s) are marked damaged. They still return to stock; deal with them from there.</Alert>
        )}
        <Field label={approving ? "Note" : "Reason"} required={!approving}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
