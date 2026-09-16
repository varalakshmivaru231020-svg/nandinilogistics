"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import {
  DetailAction, DetailScreen, PanelCard, SoftPill,
} from "@/components/shell/detail-screen";
import { cn, qty } from "@/lib/utils";
import { createIndentAction, updateIndentAction } from "../actions";

interface ProjectOpt {
  id: string;
  name: string;
  code: string;
  workPackages: Array<{ id: string; code: string; name: string }>;
}

interface ItemOpt {
  id: string;
  code: string;
  name: string;
  uom: string;
  category: string;
  standardRate: number;
  /** What the store is holding right now, which the builder checks each line against. */
  onHand: number;
}

interface Line {
  key: string;
  /** Set for a line that already exists on the indent being edited. */
  id?: string;
  itemId: string;
  requestedQty: string;
  estimatedRate: string;
  specification: string;
}

/** An existing indent, not yet approved, being edited in place. */
export interface IndentEditState {
  indentId: string;
  indentNo: string;
  projectLabel: string;
  projectId: string;
  workPackages: Array<{ id: string; code: string; name: string }>;
  initial: {
    workPackageId: string;
    requiredByDate: string;
    purpose: string;
    remarks: string;
    lines: Array<{ id: string; itemId: string; requestedQty: number; estimatedRate: number; specification: string }>;
  };
}

const LABEL = "text-[11px] font-semibold text-navy-600";
const REQUIRED = <span className="text-bad-600">*</span>;
const FIELD =
  "w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white";

/**
 * The design's indent builder: the requirement on the left, the item master on
 * the right, and the picked lines underneath with what the store can do about
 * each one.
 */
export function IndentForm({
  projects, items, canSubmit, edit, startWithItemId,
}: {
  projects: ProjectOpt[]; items: ItemOpt[]; canSubmit: boolean; edit?: IndentEditState;
  /** Raised from the item master: the indent opens on that item. */
  startWithItemId?: string;
}) {
  const router = useRouter();
  const init = edit?.initial;
  const [projectId, setProjectId] = React.useState(edit?.projectId ?? projects[0]?.id ?? "");
  const [requiredByDate, setRequiredByDate] = React.useState(init?.requiredByDate ?? "");
  const [activity, setActivity] = React.useState(init?.purpose ?? "");
  const [remarks, setRemarks] = React.useState(init?.remarks ?? "");
  const [pick, setPick] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>(() => {
    if (init) {
      return init.lines.map((l) => ({
        key: l.id,
        id: l.id,
        itemId: l.itemId,
        requestedQty: String(l.requestedQty),
        estimatedRate: String(l.estimatedRate),
        specification: l.specification,
      }));
    }
    const first = items.find((i) => i.id === startWithItemId);
    return first
      ? [{ key: first.id, itemId: first.id, requestedQty: "", estimatedRate: String(first.standardRate), specification: "" }]
      : [];
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const workPackages = edit ? edit.workPackages : projects.find((p) => p.id === projectId)?.workPackages ?? [];

  // What is left to add, narrowed by the search box.
  const pool = items.filter(
    (i) =>
      !lines.some((l) => l.itemId === i.id) &&
      (!pick.trim() || `${i.name} ${i.code}`.toLowerCase().includes(pick.trim().toLowerCase())),
  );

  function add(item: ItemOpt) {
    setLines((ls) => [
      ...ls,
      { key: item.id, itemId: item.id, requestedQty: "", estimatedRate: String(item.standardRate), specification: "" },
    ]);
  }

  function setQty(key: string, value: string) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, requestedQty: value.replace(/[^\d.]/g, "") } : l)));
  }

  async function save() {
    setBusy(true);
    setError(null);

    // The design types the activity; where it names a work package, the spend
    // still ties back to it.
    const matched = workPackages.find(
      (w) => w.name.toLowerCase() === activity.trim().toLowerCase(),
    );

    const header = {
      workPackageId: matched?.id,
      requiredByDate,
      purpose: activity.trim() || undefined,
      remarks: remarks.trim() || undefined,
    };

    const payload = lines
      .filter((l) => l.itemId && Number(l.requestedQty) > 0)
      .map((l) => ({
        id: l.id,
        itemId: l.itemId,
        requestedQty: Number(l.requestedQty),
        estimatedRate: Number(l.estimatedRate) || 0,
        specification: l.specification || undefined,
      }));

    if (edit) {
      const res = await updateIndentAction(edit.indentId, { ...header, items: payload });
      setBusy(false);
      if (!res.ok) { setError(res.error); return; }
      router.push(`/material/indents/${edit.indentId}`);
      router.refresh();
      return;
    }

    const res = await createIndentAction(
      {
        projectId,
        ...header,
        items: payload.map((l) => ({
          itemId: l.itemId,
          requestedQty: l.requestedQty,
          estimatedRate: l.estimatedRate,
          specification: l.specification,
        })),
      },
      canSubmit,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/indents/${res.data.id}`);
  }

  const ready =
    projectId && requiredByDate && activity.trim() && remarks.trim() &&
    lines.some((l) => l.itemId && Number(l.requestedQty) > 0);

  return (
    <DetailScreen
      backHref="/material/indents"
      title={edit ? "Edit requirement indent" : "Raise requirement indent"}
      pills={
        edit ? (
          <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
            {edit.indentNo}
          </span>
        ) : null
      }
      subtitle="Internal request to the store — the store issues from stock and raises a PO only for the shortfall."
      actions={
        <>
          <DetailAction tone="plain" onClick={() => router.push("/material/indents")}>Cancel</DetailAction>
          <DetailAction tone="primary" disabled={!ready || busy} onClick={save}>
            {edit ? "Save indent" : canSubmit ? "Raise indent & send for approval" : "Save as draft"}
          </DetailAction>
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Requirement details
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Project {REQUIRED}</span>
              <select
                value={projectId}
                disabled={Boolean(edit)}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(FIELD, "mt-1.5")}
              >
                {projects.length === 0 && <option value="">No projects mapped to you</option>}
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Required by {REQUIRED}</span>
              <input
                type="date"
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                className={cn(FIELD, "mt-1.5")}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={LABEL}>Activity / work front {REQUIRED}</span>
              <input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                list="indent-work-fronts"
                placeholder="Slab casting floor 7"
                className={cn(FIELD, "mt-1.5")}
              />
              <datalist id="indent-work-fronts">
                {workPackages.map((w) => <option key={w.id} value={w.name} />)}
              </datalist>
            </label>
            <label className="block sm:col-span-2">
              <span className={LABEL}>Remarks {REQUIRED}</span>
              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. needed before the pour on 10 Sep, deliver to floor 7 hoist…"
                className={cn(FIELD, "mt-1.5 resize-y")}
              />
            </label>
          </div>
        </div>

        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Add items from item master
          </div>
          <input
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder="Search item name or code…"
            className={FIELD}
          />
          <div className="mt-2.5 max-h-[280px] overflow-y-auto">
            {pool.slice(0, 40).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => add(i)}
                className="flex w-full cursor-pointer items-center gap-2 border-b border-line-100 px-1 py-2.5 text-left last:border-0 hover:bg-surface-tint"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-navy-900">{i.name}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                    {i.code} · {qty(i.onHand, 3)} {i.uom} in stock
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] font-bold text-brand-700">+ Add</span>
              </button>
            ))}
            {pool.length === 0 && (
              <div className="py-4 text-center text-[12px] font-medium text-muted-400">
                No matching items left to add
              </div>
            )}
          </div>
        </div>
      </div>

      <PanelCard
        title="Requested items"
        right={
          <span className="text-[11.5px] font-semibold text-muted-600">
            {lines.length} {lines.length === 1 ? "item" : "items"}
          </span>
        }
      >
        {lines.length === 0 ? (
          <div className="px-7 py-8 text-center">
            <div className="text-[12.5px] font-semibold text-muted-600">
              No items yet — pick them from the item master above
            </div>
            <div className="mt-1 text-[11.5px] font-medium text-muted-400">
              Select as many items as the work front needs; the store checks each against live stock
            </div>
          </div>
        ) : (
          lines.map((l) => {
            const item = itemById.get(l.itemId);
            const need = Number(l.requestedQty) || 0;
            const have = item?.onHand ?? 0;
            const canIssue = Math.min(have, need);
            const verdict = need === 0
              ? { text: "Enter a quantity", tone: "muted" as const }
              : canIssue >= need
                ? { text: "Issue from stock", tone: "good" as const }
                : canIssue > 0
                  ? { text: `Issue ${qty(canIssue, 3)} now · PO ${qty(need - canIssue, 3)}`, tone: "brand" as const }
                  : { text: "Not in stock — PO needed", tone: "warn" as const };
            return (
              <div
                key={l.key}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-100 px-5 py-3.5 last:border-0"
              >
                <div className="min-w-[180px] flex-[1_1_220px]">
                  <div className="text-[12.5px] font-semibold text-navy-900">{item?.name ?? "—"}</div>
                  <div className="mt-0.5 text-[11px] font-medium text-muted-400">{item?.code ?? ""}</div>
                </div>
                <label className="block w-[130px]">
                  <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">
                    Reqd qty · {item?.uom ?? ""}
                  </span>
                  <input
                    value={l.requestedQty}
                    onChange={(e) => setQty(l.key, e.target.value)}
                    placeholder="0"
                    className={cn(FIELD, "mt-1 py-2")}
                  />
                </label>
                <div className="w-[110px]">
                  <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">In stock</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-navy-600">
                    {qty(have, 3)} {item?.uom ?? ""}
                  </div>
                </div>
                <div className="min-w-[170px] flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Fulfilment</div>
                  <div className="mt-1"><SoftPill tone={verdict.tone}>{verdict.text}</SoftPill></div>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="shrink-0 cursor-pointer rounded-[7px] border border-bad-100 bg-bad-050 px-3 py-1.5 text-[11px] font-semibold text-bad-700 transition-colors hover:bg-[#F8DBDB]"
                >
                  Remove
                </button>
              </div>
            );
          })
        )}
      </PanelCard>
    </DetailScreen>
  );
}
