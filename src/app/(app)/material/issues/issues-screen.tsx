"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
import { acknowledgeIssueAction } from "./actions";

interface Line {
  id: string; name: string; uom: string; issuedQty: number; rate: number; value: number;
}

interface Issue {
  id: string; issueNo: string; issueDate: string; projectCode: string; storeName: string;
  workPackage: string | null; issuedByName: string; issuedToId: string; issuedToName: string;
  purpose: string | null; totalValue: number; acknowledgedAt: string | null; lines: Line[];
}

export function IssuesScreen({
  issues, pendingAck, currentUserId, canAcknowledge, canViewValue,
}: {
  issues: Issue[];
  pendingAck: number;
  currentUserId: string;
  canAcknowledge: boolean;
  canViewValue: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", !isOpen && "-rotate-90")} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{issue.issueNo}</span>
                      <Badge tone="slate">{issue.projectCode}</Badge>
                      {issue.acknowledgedAt ? (
                        <Badge tone="green">Acknowledged</Badge>
                      ) : (
                        <Badge tone="amber">Awaiting acknowledgement</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {issue.storeName} → {issue.issuedToName} · {formatDate(issue.issueDate)}
                      {issue.workPackage && ` · ${issue.workPackage}`}
                      {issue.purpose && ` · ${issue.purpose}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="num text-sm font-medium text-slate-800">
                      {canViewValue ? money(issue.totalValue) : `${issue.lines.length} line(s)`}
                    </p>
                    <p className="text-xs text-slate-400">issued by {issue.issuedByName}</p>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <ul className="divide-y divide-slate-100">
                      {issue.lines.map((l) => (
                        <li key={l.id} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-slate-700">{l.name}</span>
                          <span className="num text-xs text-slate-600">
                            {qty(l.issuedQty, 3)} {l.uom}
                            {canViewValue && ` @ ${money(l.rate, true)} = ${money(l.value)}`}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {!issue.acknowledgedAt && canAcknowledge && mine && (
                      <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                        <Button size="sm" variant="success" loading={busy === issue.id}
                          onClick={() => acknowledge(issue.id)}>
                          <Check className="h-3.5 w-3.5" />
                          Acknowledge receipt
                        </Button>
                      </div>
                    )}

                    {!issue.acknowledgedAt && !mine && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        Only {issue.issuedToName} can acknowledge this slip — on the mobile app, at site.
                      </p>
                    )}

                    {issue.acknowledgedAt && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-emerald-700">
                        Acknowledged on {formatDate(issue.acknowledgedAt)}.
                      </p>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
