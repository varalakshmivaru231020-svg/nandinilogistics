"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from "@/components/ui/primitives";
import { formatDate, money, qty } from "@/lib/utils";
import { QTY_EPSILON, RETURN_CONDITIONS, type ReturnCondition } from "@/lib/material/return-caps";
import type { ReturnableIssue } from "../lookups";
import { raiseReturnAction } from "../actions";

interface LineState {
  quantity: string;
  condition: ReturnCondition;
  remarks: string;
}

const blank: LineState = { quantity: "", condition: "Good", remarks: "" };

export function ReturnForm({
  issues, initialIssueId, canViewValue,
}: {
  issues: ReturnableIssue[];
  initialIssueId: string;
  canViewValue: boolean;
}) {
  const router = useRouter();
  const [issueId, setIssueId] = React.useState(initialIssueId);
  const [reason, setReason] = React.useState("");
  // Keyed by issue line id, so switching issue leaves nothing stale behind.
  const [state, setState] = React.useState<Record<string, LineState>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const issue = issues.find((i) => i.id === issueId) ?? null;

  const rows = (issue?.lines ?? []).map((l) => {
    const s = state[l.issueItemId] ?? blank;
    const requested = Number(s.quantity) || 0;
    return { l, s, requested, over: requested > l.returnable + QTY_EPSILON, value: requested * l.rate };
  });
  const hasError = rows.some((r) => r.over || r.requested < 0);
  const totalValue = rows.reduce((sum, r) => sum + (r.requested > 0 ? r.value : 0), 0);
  const damaged = rows.some((r) => r.requested > 0 && r.s.condition === "Damaged");
  const ready = issue && reason.trim() && rows.some((r) => r.requested > 0) && !hasError;

  function update(id: string, patch: Partial<LineState>) {
    setState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? blank), ...patch } }));
  }

  async function save() {
    if (!issue) return;
    setBusy(true);
    setError(null);
    const res = await raiseReturnAction({
      issueId: issue.id,
      reason,
      lines: rows
        .filter((r) => r.requested > 0)
        .map((r) => ({
          issueItemId: r.l.issueItemId,
          quantity: r.requested,
          condition: r.s.condition,
          remarks: r.s.remarks || undefined,
        })),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/returns/${res.data.id}`);
  }

  if (issues.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="py-6 text-center text-sm text-muted-500">
            There is nothing to return: no active issue slip in your projects has material still out on site.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>Return against</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issue slip" required hint="Only active slips with something left to return are listed.">
              <Select value={issueId} onChange={(e) => setIssueId(e.target.value)}>
                {issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.issueNo} — {i.projectCode} · {formatDate(i.issueDate)}
                  </option>
                ))}
              </Select>
            </Field>

            {issue && (
              <div className="text-sm">
                <p className="text-xs text-muted-500">Returns into</p>
                <p className="mt-0.5 text-navy-900">{issue.storeName}</p>
                <p className="mt-2 text-xs text-muted-500">Issued to</p>
                <p className="mt-0.5 text-navy-900">{issue.issuedToName}</p>
              </div>
            )}

            <Field label="Reason for the return" required className="sm:col-span-2">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Slab poured — surplus cement" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          {rows.map(({ l, s, over }) => (
            <div key={l.issueItemId}
              className={`rounded-md border p-3 ${over ? "border-bad-600 bg-bad-050" : "border-line-400"}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-navy-900">{l.name}</span>
                <span className="num text-xs text-muted-500">
                  issued {qty(l.issuedQty, 3)} · returned {qty(l.returnedQty, 3)}
                  {l.pendingQty > 0 && ` · ${qty(l.pendingQty, 3)} on pending returns`}
                  {" · "}
                  <span className="font-medium text-navy-700">{qty(l.returnable, 3)} {l.uom} returnable</span>
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-12">
                <Field label={`Quantity (${l.uom})`} className="sm:col-span-3">
                  <Input type="number" step="any" min={0} className="num text-right"
                    disabled={l.returnable <= 0}
                    value={s.quantity}
                    onChange={(e) => update(l.issueItemId, { quantity: e.target.value })} />
                </Field>
                <Field label="Condition" className="sm:col-span-3">
                  <Select value={s.condition}
                    onChange={(e) => update(l.issueItemId, { condition: e.target.value as ReturnCondition })}>
                    {RETURN_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Remarks" className="sm:col-span-6">
                  <Input value={s.remarks} onChange={(e) => update(l.issueItemId, { remarks: e.target.value })} />
                </Field>
              </div>

              {over && (
                <p className="mt-2 text-xs text-bad-600">Only {qty(l.returnable, 3)} {l.uom} can be returned.</p>
              )}
            </div>
          ))}

          {damaged && (
            <Alert tone="warn">
              Damaged material still returns to stock when approved; its condition is recorded for the store.
            </Alert>
          )}

          {canViewValue && (
            <div className="flex items-center justify-end gap-3 border-t border-line-400 pt-3">
              <span className="text-sm text-muted-500">Value at issue rates</span>
              <span className="num text-lg font-semibold text-navy-950">{money(totalValue)}</span>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {hasError && <Badge tone="bad">Reduce the highlighted quantities</Badge>}
        <Button onClick={save} loading={busy} disabled={!ready}>
          <Undo2 className="h-3.5 w-3.5" />
          Raise return
        </Button>
      </div>
    </div>
  );
}
