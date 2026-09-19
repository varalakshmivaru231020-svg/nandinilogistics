"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { DetailAction, DetailScreen } from "@/components/shell/detail-screen";
import { cn, qty } from "@/lib/utils";
import { chooseStore, heldIn, issuable } from "@/lib/material/issue-plan";
import { createIssueAction } from "../actions";

interface StockRow {
  itemId: string; storeId: string; code: string; name: string;
  uom: string; available: number; avgRate: number;
}

/** What an indent hands the form when the issue is raised from one. */
export interface FromIndent {
  id: string;
  indentNo: string;
  projectId: string;
  projectName: string;
  activity: string | null;
  workPackageId: string | null;
  purpose: string | null;
  lines: Array<{
    itemId: string; code: string; name: string; uom: string;
    required: number; onHand: number; pending: number; canIssue: number;
  }>;
}

const LABEL = "text-[11px] font-semibold text-navy-600";
const REQUIRED = <span className="text-bad-600">*</span>;
const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white";

/**
 * The design's issue screen: who is taking the material, and how much of each
 * pending line goes out now — pre-filled with the most the store can hand over.
 */
export function IssueForm({
  stores, recipients, stock, fromIndent, issuedByName,
}: {
  stores: Array<{ id: string; name: string; projectId: string | null }>;
  recipients: Array<{ id: string; name: string; designation: string | null }>;
  stock: StockRow[];
  fromIndent: FromIndent;
  /** The store person doing the handover — the signed-in user. */
  issuedByName: string;
}) {
  const router = useRouter();

  // Which store this comes out of, and what it can actually hand over.
  const storeId = React.useMemo(
    () => chooseStore(stores, stock, fromIndent.projectId, fromIndent.lines),
    [stores, stock, fromIndent.projectId, fromIndent.lines],
  );
  const storeName = stores.find((x) => x.id === storeId)?.name ?? "the store";

  const [issuedToId, setIssuedToId] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [amounts, setAmounts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      fromIndent.lines.map((l) => {
        const most = issuable(stock, storeId, l);
        return [l.itemId, most > 0 ? String(most) : ""];
      }),
    ),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const rows = fromIndent.lines.map((l) => {
    const value = Number(amounts[l.itemId]) || 0;
    const inStore = heldIn(stock, storeId, l.itemId);
    const max = issuable(stock, storeId, l);
    return { line: l, value, inStore, max, over: value > max + 0.0001 };
  });

  const issuing = rows.filter((r) => r.value > 0);
  const total = issuing.reduce((s, r) => s + r.value, 0);
  const hasError = rows.some((r) => r.over);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createIssueAction({
      projectId: fromIndent.projectId,
      storeId,
      workPackageId: fromIndent.workPackageId || undefined,
      indentId: fromIndent.id,
      issuedToId,
      purpose: fromIndent.purpose || undefined,
      remarks: remarks || undefined,
      items: issuing.map((r) => ({ itemId: r.line.itemId, issuedQty: r.value })),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/indents/${fromIndent.id}`);
  }

  const ready = Boolean(issuedToId) && issuing.length > 0 && !hasError && Boolean(storeId);

  return (
    <DetailScreen
      backHref={`/material/indents/${fromIndent.id}`}
      title="Issue material to project"
      pills={
        <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
          {fromIndent.indentNo}
        </span>
      }
      subtitle={`${fromIndent.projectName}${fromIndent.activity ? ` · ${fromIndent.activity}` : ""} — issuing reduces store stock and closes the indent line by line.`}
      actions={
        <DetailAction tone="success" disabled={!ready || busy} onClick={save}>
          ↗ Confirm issue
        </DetailAction>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="max-w-[820px] rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Handover details
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Issued to · site person {REQUIRED}</span>
            <select value={issuedToId} onChange={(e) => setIssuedToId(e.target.value)} className={FIELD}>
              <option value="">Who is taking it?</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.designation ? ` · ${r.designation}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Issued by · store</span>
            <input value={issuedByName} readOnly className={cn(FIELD, "cursor-default")} />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Remarks</span>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. loaded on hoist, acknowledged on mobile…"
              className={cn(FIELD, "resize-y")}
            />
          </label>
        </div>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-[13px] border border-line-400 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-200 px-5 py-3.5">
          <span className="font-display text-[13.5px] font-bold text-navy-950">Quantity to issue</span>
          <span className="text-[11.5px] font-medium text-muted-600">
            Pre-filled with the most {storeName} can issue — adjust as needed
          </span>
        </div>

        {rows.map(({ line, value, inStore, max, over }) => {
          const effect =
            value <= 0
              ? { text: "Nothing goes out on this line", tone: "bg-surface-field text-navy-500" }
              : value >= line.pending
                ? { text: "Closes this line", tone: "bg-good-050 text-good-700" }
                : { text: "Part issue · balance stays open", tone: "bg-warn-050 text-warn-700" };
          return (
            <div
              key={line.itemId}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line-100 px-5 py-4 last:border-0"
            >
              <div className="min-w-[160px] flex-[1_1_180px]">
                <div className="text-[12.5px] font-semibold text-navy-900">{line.name}</div>
                <div className="mt-0.5 text-[11px] font-medium text-muted-400">{line.code}</div>
              </div>
              <div className="w-[90px]">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Required</div>
                <div className="mt-1 text-[12.5px] font-bold text-navy-950">{qty(line.required, 3)} {line.uom}</div>
              </div>
              <div className="w-[90px]">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">In stock</div>
                <div className={cn("mt-1 text-[12.5px] font-semibold", inStore > 0 ? "text-navy-600" : "text-bad-600")}>
                  {qty(inStore, 3)} {line.uom}
                </div>
              </div>
              <div className="w-[90px]">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Pending</div>
                <div className="mt-1 text-[12.5px] font-bold text-warn-700">{qty(line.pending, 3)} {line.uom}</div>
              </div>
              <div className="w-[150px]">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-good-700">Issue now</div>
                <input
                  value={amounts[line.itemId] ?? ""}
                  onChange={(e) =>
                    setAmounts((a) => ({ ...a, [line.itemId]: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                  placeholder="0"
                  className={cn(FIELD, "py-2", over && "border-bad-600 bg-bad-050")}
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAmounts((a) => ({ ...a, [line.itemId]: String(max) }))}
                    className="cursor-pointer rounded-[7px] bg-good-050 px-2 py-1 text-[10.5px] font-semibold text-good-700"
                  >
                    max {qty(max, 3)} {line.uom}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmounts((a) => ({ ...a, [line.itemId]: "" }))}
                    className="cursor-pointer rounded-[7px] border border-line-400 px-2 py-1 text-[10.5px] font-semibold text-muted-600"
                  >
                    clear
                  </button>
                </div>
              </div>
              <div className="min-w-[170px] flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Effect</div>
                <div className="mt-1">
                  <span className={cn("inline-flex rounded-full px-[10px] py-[5px] text-[10.5px] font-bold", effect.tone)}>
                    {effect.text}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap justify-end gap-[34px] bg-surface-sunken px-5 py-4">
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-muted-400">Lines issuing</div>
            <div className="mt-[3px] text-[14px] font-bold text-navy-600">
              {issuing.length} {issuing.length === 1 ? "line" : "lines"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-good-700">Total quantity</div>
            <div className="mt-[3px] font-display text-[20px] font-extrabold text-good-700">{qty(total, 3)}</div>
          </div>
        </div>
      </div>

      {hasError && (
        <div className="mt-3.5">
          <Alert tone="error">A line is issuing more than the store holds or the indent still needs.</Alert>
        </div>
      )}
    </DetailScreen>
  );
}
