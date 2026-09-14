"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Check, PackageSearch, Pencil, Printer, Send, ThumbsDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn, formatDate, formatDateTime, money, qty } from "@/lib/utils";
import {
  approveIndentAction, cancelIndentAction, rejectIndentAction,
  stockCheckAction, submitIndentAction,
} from "../actions";

interface Indent {
  updatedAt: string;
  id: string; indentNo: string; status: string; raisedAt: string; requiredByDate: string;
  purpose: string | null; remarks: string | null; estimatedValue: number; raisedById: string;
  projectName: string; projectCode: string; workPackage: string | null; raisedByName: string;
}

interface ItemLine {
  id: string; itemId: string; code: string; name: string; uom: string;
  requestedQty: number; approvedQty: number | null; issueFromStockQty: number;
  toPurchaseQty: number; estimatedRate: number; specification: string | null; onHand: number;
}

interface Approval {
  id: string; level: string; decision: string; approverName: string;
  approvedAt: string; remarks: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

/** The chain from the scope document, rendered as a live progress rail. */
const CHAIN = [
  { key: "RAISED", label: "Requirement Indent", who: "Supervisor" },
  { key: "PM", label: "PM Approval", who: "Project Manager" },
  { key: "ADMIN", label: "Admin Approval", who: "Owner / Admin" },
  { key: "STORE", label: "Store Office", who: "Stock check first" },
  { key: "PO", label: "Purchase Order", who: "Store · approved" },
];

function chainStage(status: string): number {
  switch (status) {
    case "DRAFT": return 0;
    case "SUBMITTED": return 1;
    case "PM_APPROVED": return 2;
    case "ADMIN_APPROVED": return 3;
    case "PARTIALLY_ORDERED":
    case "ORDERED":
    case "CLOSED": return 4;
    default: return -1;
  }
}

export function IndentDetail({
  indent, items, approvals, can, currentUserId, approvalCeiling, editable,
}: {
  indent: Indent;
  items: ItemLine[];
  approvals: Approval[];
  can: Record<string, boolean>;
  currentUserId: string;
  approvalCeiling: number;
  /** No approval step recorded yet — decided on the server. */
  editable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [approving, setApproving] = React.useState<"PM" | "ADMIN" | null>(null);
  const [rejecting, setRejecting] = React.useState(false);

  const stage = chainStage(indent.status);
  const terminal = ["REJECTED", "CANCELLED"].includes(indent.status);

  const awaitingPm = indent.status === "SUBMITTED";
  const awaitingAdmin = indent.status === "PM_APPROVED";
  const isOwnDraft = indent.status === "DRAFT" && indent.raisedById === currentUserId;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else { setNotice(successMsg); router.refresh(); }
  }

  const columns: Column<ItemLine>[] = [
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <div>
          <p className="text-sm text-navy-900">{l.name}</p>
          <p className="text-xs text-muted-500">
            <code>{l.code}</code>
            {l.specification && ` · ${l.specification}`}
          </p>
        </div>
      ),
    },
    {
      key: "requested",
      header: "Requested",
      align: "right",
      className: "num",
      render: (l) => `${qty(l.requestedQty, 3)} ${l.uom}`,
    },
    {
      key: "approved",
      header: "Approved",
      align: "right",
      className: "num",
      render: (l) => {
        if (l.approvedQty === null) return <span className="text-muted-400">—</span>;
        const revised = l.approvedQty !== l.requestedQty;
        return (
          <span className={revised ? "font-medium text-warn-700" : ""}>
            {qty(l.approvedQty, 3)} {l.uom}
            {revised && <span className="ml-1 text-[10px]">revised</span>}
          </span>
        );
      },
    },
    {
      key: "onHand",
      header: "In store",
      align: "right",
      className: "num",
      render: (l) => (
        <span className={l.onHand > 0 ? "text-good-700" : "text-muted-400"}>
          {qty(l.onHand, 3)}
        </span>
      ),
    },
    {
      key: "fromStock",
      header: "Issue from stock",
      align: "right",
      className: "num",
      render: (l) =>
        l.issueFromStockQty > 0 ? (
          <span className="font-medium text-good-700">{qty(l.issueFromStockQty, 3)}</span>
        ) : (
          <span className="text-muted-400">—</span>
        ),
    },
    {
      key: "toPurchase",
      header: "To purchase",
      align: "right",
      className: "num",
      render: (l) =>
        l.toPurchaseQty > 0 ? (
          <span className="font-medium text-navy-900">{qty(l.toPurchaseQty, 3)}</span>
        ) : (
          <span className="text-muted-400">—</span>
        ),
    },
    { key: "rate", header: "Rate", align: "right", className: "num", render: (l) => money(l.estimatedRate) },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "num",
      render: (l) => money((l.approvedQty ?? l.requestedQty) * l.estimatedRate),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {/* Approval chain rail */}
      <Card>
        <CardBody className="py-4">
          {terminal ? (
            <Alert tone="error" title={`This indent was ${indent.status.toLowerCase()}`}>
              {approvals.at(-1)?.remarks ?? "No reason recorded."}
            </Alert>
          ) : (
            <ol className="flex flex-wrap items-center gap-y-3">
              {CHAIN.map((step, i) => {
                const done = i < stage;
                const current = i === stage;
                return (
                  <li key={step.key} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                          done ? "bg-good-600 text-white"
                            : current ? "bg-brand-600 text-white ring-4 ring-brand-100"
                            : "bg-line-400 text-muted-500",
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <div className="mr-4">
                        <p className={cn("text-xs font-medium", current ? "text-brand-800" : "text-navy-600")}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-muted-400">{step.who}</p>
                      </div>
                    </div>
                    {i < CHAIN.length - 1 && (
                      <span className={cn("mr-4 hidden h-0.5 w-8 sm:block", done ? "bg-good-600" : "bg-line-400")} />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* Summary + actions */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Indent details</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Project", `${indent.projectCode} — ${indent.projectName}`],
                ["Work package", indent.workPackage ?? "—"],
                ["Raised by", indent.raisedByName],
                ["Raised on", formatDate(indent.raisedAt)],
                ["Required by", formatDate(indent.requiredByDate)],
                ["For", indent.purpose ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
            {indent.remarks && (
              <p className="mt-3 border-t border-line-200 pt-3 text-sm text-muted-600">{indent.remarks}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Value &amp; actions</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-muted-500">Estimated value</p>
              <p className="num text-2xl font-semibold text-navy-950">{money(indent.estimatedValue)}</p>
              {approvalCeiling > 0 && (
                <p className="mt-1 text-[11px] text-muted-500">
                  Your approval ceiling is {money(approvalCeiling)}.
                  {indent.estimatedValue <= approvalCeiling
                    ? " This is within it, so approving here completes the chain."
                    : " This is above it, so it must go to the next level."}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
              {editable && can.update && (
                <Link href={`/material/indents/${indent.id}/edit`}>
                  <Button size="sm" variant="secondary" className="w-full">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit indent
                  </Button>
                </Link>
              )}

              {can.print && (
                <Link href={`/print/indents/${indent.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="secondary" className="w-full">
                    <Printer className="h-3.5 w-3.5" />
                    Print indent
                  </Button>
                </Link>
              )}

              {isOwnDraft && can.submit && (
                <Button size="sm" loading={busy} onClick={() => run(() => submitIndentAction(indent.id), "Submitted for approval.")}>
                  <Send className="h-3.5 w-3.5" />
                  Submit for approval
                </Button>
              )}

              {awaitingPm && can.approvePm && (
                <Button size="sm" variant="success" onClick={() => setApproving("PM")}>
                  <Check className="h-3.5 w-3.5" />
                  Approve — PM level
                </Button>
              )}

              {awaitingAdmin && can.approveAdmin && (
                <Button size="sm" variant="success" onClick={() => setApproving("ADMIN")}>
                  <Check className="h-3.5 w-3.5" />
                  Approve — Admin level
                </Button>
              )}

              {(awaitingPm || awaitingAdmin) && can.reject && (
                <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </Button>
              )}

              {indent.status === "ADMIN_APPROVED" && can.stockCheck && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => run(() => stockCheckAction(indent.id), "Stock check complete — only the shortfall needs a PO.")}
                >
                  <PackageSearch className="h-3.5 w-3.5" />
                  Run stock check
                </Button>
              )}

              {!terminal && can.cancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() => run(() => cancelIndentAction(indent.id, "", indent.updatedAt), "Indent cancelled.")}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Cancel indent
                </Button>
              )}

              {awaitingPm && !can.approvePm && (
                <p className="text-xs text-muted-500">
                  Waiting on Project Manager approval. You do not hold that permission.
                </p>
              )}
              {awaitingAdmin && !can.approveAdmin && (
                <p className="text-xs text-muted-500">
                  Waiting on Owner / Admin approval. You do not hold that permission.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Items */}
      {can.tabItems && (
        <Card>
          <CardHeader>
            <CardTitle>Items ({items.length})</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <DataTable columns={columns} rows={items} rowKey={(l) => l.id} dense />
          </CardBody>
        </Card>
      )}

      {/* Approval trail */}
      {can.tabApprovals && (
        <Card>
          <CardHeader>
            <CardTitle>Approval trail</CardTitle>
            <span className="text-xs text-muted-500">Who approved, when, and what they changed.</span>
          </CardHeader>
          <CardBody className="p-0">
            {approvals.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-500">
                No approval steps recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-line-200">
                {approvals.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={a.decision === "APPROVED" ? "good" : "bad"}>
                        {a.decision}
                      </Badge>
                      <Badge tone="brand">{a.level} level</Badge>
                      <span className="text-sm text-navy-900">{a.approverName}</span>
                      <span className="text-xs text-muted-400">{formatDateTime(a.approvedAt)}</span>
                    </div>
                    {a.remarks && <p className="mt-1 text-sm text-muted-600">{a.remarks}</p>}
                    {a.changes && Object.keys(a.changes).length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 border-l-2 border-warn-700 pl-2">
                        {Object.entries(a.changes).map(([key, v]) => (
                          <li key={key} className="text-xs text-muted-600">
                            Quantity revised from{" "}
                            <span className="font-medium text-bad-600">{String(v.from)}</span> to{" "}
                            <span className="font-medium text-good-700">{String(v.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {approving && (
        <ApproveModal
          level={approving}
          items={items}
          canRevise={can.reviseQty}
          onClose={() => setApproving(null)}
          onDone={(msg) => { setApproving(null); setNotice(msg); router.refresh(); }}
          indentId={indent.id} updatedAt={indent.updatedAt}
        />
      )}

      {rejecting && (
        <RejectModal
          indentId={indent.id} updatedAt={indent.updatedAt}
          onClose={() => setRejecting(false)}
          onDone={(msg) => { setRejecting(false); setNotice(msg); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ApproveModal({
  indentId, updatedAt, level, items, canRevise, onClose, onDone,
}: {
  indentId: string;
  /** What the approver is looking at — the approval refuses if the indent has changed since. */
  updatedAt: string;
  level: "PM" | "ADMIN";
  items: ItemLine[];
  canRevise: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [remarks, setRemarks] = React.useState("");
  const [quantities, setQuantities] = React.useState<Record<string, string>>(
    () => Object.fromEntries(items.map((i) => [i.id, String(i.approvedQty ?? i.requestedQty)])),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const revisions = items
    .filter((i) => Number(quantities[i.id]) !== (i.approvedQty ?? i.requestedQty))
    .map((i) => ({ itemId: i.id, approvedQty: Number(quantities[i.id]) }));

  const total = items.reduce(
    (sum, i) => sum + (Number(quantities[i.id]) || 0) * i.estimatedRate,
    0,
  );

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await approveIndentAction(indentId, level, remarks, revisions, updatedAt);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      onDone(
        res.data.skippedAdmin
          ? "Approved. The value is within your ceiling, so the Admin level was skipped."
          : `Approved at ${level} level.`,
      );
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve at ${level} level`}
      description={canRevise ? "You can revise quantities before approving — the change is recorded on the trail." : undefined}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={submit} loading={busy}>
            <Check className="h-3.5 w-3.5" />
            Approve {money(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-md border border-line-400 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-navy-900">{i.name}</p>
                <p className="text-xs text-muted-500">
                  Requested {qty(i.requestedQty, 3)} {i.uom} · {money(i.estimatedRate)}/{i.uom}
                </p>
              </div>
              <div className="w-32 shrink-0">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  disabled={!canRevise}
                  value={quantities[i.id] ?? ""}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.id]: e.target.value }))}
                  className="num text-right"
                />
              </div>
            </div>
          ))}
        </div>

        {revisions.length > 0 && (
          <Alert tone="warn">
            {revisions.length} quantity revision(s) will be recorded against your approval.
          </Alert>
        )}

        <Field label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Optional note for the trail" />
        </Field>
      </div>
    </Modal>
  );
}

function RejectModal({
  indentId, updatedAt, onClose, onDone,
}: { indentId: string; updatedAt: string; onClose: () => void; onDone: (message: string) => void }) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await rejectIndentAction(indentId, remarks, updatedAt);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Indent rejected.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject this indent"
      description="A reason is mandatory and stays on the approval trail."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!remarks.trim()}>
            <X className="h-3.5 w-3.5" />
            Reject indent
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
