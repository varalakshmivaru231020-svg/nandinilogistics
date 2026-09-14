"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { money } from "@/lib/utils";
import { indentEstimatedValue } from "@/lib/material/procurement";
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
}

interface Line {
  key: string;
  /** Set for a line that already exists on the indent being edited. */
  id?: string;
  /** The item and rate the existing line was raised with — kept while the item is unchanged. */
  originalItemId?: string;
  originalRate?: string;
  itemId: string;
  requestedQty: string;
  estimatedRate: string;
  specification: string;
}

function blankLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: "",
    requestedQty: "",
    estimatedRate: "",
    specification: "",
  };
}

/** An existing indent, not yet approved, being edited in place. */
export interface IndentEditState {
  indentId: string;
  projectLabel: string;
  workPackages: Array<{ id: string; code: string; name: string }>;
  initial: {
    workPackageId: string;
    requiredByDate: string;
    purpose: string;
    remarks: string;
    lines: Array<{ id: string; itemId: string; requestedQty: number; estimatedRate: number; specification: string }>;
  };
}

export function IndentForm({
  projects, items, canSubmit, edit,
}: { projects: ProjectOpt[]; items: ItemOpt[]; canSubmit: boolean; edit?: IndentEditState }) {
  const router = useRouter();
  const init = edit?.initial;
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [workPackageId, setWorkPackageId] = React.useState(init?.workPackageId ?? "");
  const [requiredByDate, setRequiredByDate] = React.useState(init?.requiredByDate ?? "");
  const [purpose, setPurpose] = React.useState(init?.purpose ?? "");
  const [remarks, setRemarks] = React.useState(init?.remarks ?? "");
  const [lines, setLines] = React.useState<Line[]>(() =>
    init
      ? init.lines.map((l) => ({
          key: l.id,
          id: l.id,
          originalItemId: l.itemId,
          originalRate: String(l.estimatedRate),
          itemId: l.itemId,
          requestedQty: String(l.requestedQty),
          estimatedRate: String(l.estimatedRate),
          specification: l.specification,
        }))
      : [blankLine()],
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const workPackages = edit ? edit.workPackages : projects.find((p) => p.id === projectId)?.workPackages ?? [];

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = itemById.get(itemId);
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        // Back to the line's own item: its original rate returns, as the server keeps it.
        const rate = l.originalItemId && l.originalItemId === itemId
          ? l.originalRate ?? ""
          : item ? String(item.standardRate) : "";
        return { ...l, itemId, estimatedRate: rate };
      }),
    );
  }

  const total = indentEstimatedValue(
    lines.map((l) => ({ requestedQty: Number(l.requestedQty) || 0, estimatedRate: Number(l.estimatedRate) || 0 })),
  );

  async function save(submit: boolean) {
    setBusy(true);
    setError(null);

    const header = {
      workPackageId: workPackageId || undefined,
      requiredByDate,
      purpose: purpose || undefined,
      remarks: remarks || undefined,
    };

    if (edit) {
      const res = await updateIndentAction(edit.indentId, {
        ...header,
        items: lines
          .filter((l) => l.id || (l.itemId && Number(l.requestedQty) > 0))
          .map((l) => ({
            id: l.id,
            itemId: l.itemId,
            requestedQty: Number(l.requestedQty),
            specification: l.specification || undefined,
          })),
      });
      setBusy(false);
      if (!res.ok) setError(res.error);
      else {
        router.push(`/material/indents/${edit.indentId}`);
        router.refresh();
      }
      return;
    }

    const payload = {
      projectId,
      ...header,
      items: lines
        .filter((l) => l.itemId && Number(l.requestedQty) > 0)
        .map((l) => ({
          itemId: l.itemId,
          requestedQty: Number(l.requestedQty),
          estimatedRate: Number(l.estimatedRate) || 0,
          specification: l.specification || undefined,
        })),
    };

    const res = await createIndentAction(payload, submit);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/indents/${res.data.id}`);
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>Requirement</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required>
              {edit ? (
                <Input value={edit.projectLabel} disabled readOnly />
              ) : (
                <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setWorkPackageId(""); }} required>
                  {projects.length === 0 && <option value="">No projects mapped to you</option>}
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              )}
            </Field>

            <Field label="Work package" hint="Ties the spend back to the activity that caused it.">
              <Select value={workPackageId} onChange={(e) => setWorkPackageId(e.target.value)}>
                <option value="">— Not specified —</option>
                {workPackages.map((wp) => <option key={wp.id} value={wp.id}>{wp.code} — {wp.name}</option>)}
              </Select>
            </Field>

            <Field label="Required by" required>
              <Input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} required />
            </Field>

            <Field label="What it is for">
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Slab casting — 7th floor" />
            </Field>

            <Field label="Remarks" className="sm:col-span-2">
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setLines((l) => [...l, blankLine()])}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {edit && (
            <p className="text-xs text-muted-500">
              A line that keeps its item keeps the rate it was raised at; a new or changed item is valued at its standard rate.
            </p>
          )}
          {lines.map((line, idx) => {
            const item = itemById.get(line.itemId);
            const amount = (Number(line.requestedQty) || 0) * (Number(line.estimatedRate) || 0);

            return (
              <div key={line.key} className="rounded-md border border-line-400 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-500">Line {idx + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      className="rounded p-1 text-muted-400 hover:bg-bad-050 hover:text-bad-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <Field label="Item" required className="sm:col-span-5">
                    <Select value={line.itemId} onChange={(e) => onItemChange(line.key, e.target.value)}>
                      <option value="">Select an item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label={`Quantity${item ? ` (${item.uom})` : ""}`} required className="sm:col-span-2">
                    <Input
                      type="number" step="any" min={0}
                      value={line.requestedQty}
                      onChange={(e) => updateLine(line.key, { requestedQty: e.target.value })}
                    />
                  </Field>

                  <Field label="Rate (₹)" className="sm:col-span-2">
                    <Input
                      type="number" step="any" min={0}
                      value={line.estimatedRate}
                      readOnly={Boolean(edit)}
                      disabled={Boolean(edit)}
                      onChange={(e) => updateLine(line.key, { estimatedRate: e.target.value })}
                    />
                  </Field>

                  <Field label="Amount" className="sm:col-span-3">
                    <div className="num flex h-9 items-center justify-end rounded-md bg-surface-sunken px-3 text-sm font-medium text-navy-900">
                      {money(amount)}
                    </div>
                  </Field>

                  <Field label="Specification" className="sm:col-span-12">
                    <Input
                      value={line.specification}
                      onChange={(e) => updateLine(line.key, { specification: e.target.value })}
                      placeholder="Grade, make, size or any other requirement"
                    />
                  </Field>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-3 border-t border-line-400 pt-3">
            <span className="text-sm text-muted-500">Estimated value</span>
            <span className="num text-lg font-semibold text-navy-950">{money(total)}</span>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        {edit ? (
          <>
            <Button variant="secondary" onClick={() => router.push(`/material/indents/${edit.indentId}`)} disabled={busy}>
              Discard changes
            </Button>
            <Button onClick={() => save(false)} loading={busy} disabled={!requiredByDate}>
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => save(false)} loading={busy} disabled={!projectId || !requiredByDate}>
              Save as draft
            </Button>
            {canSubmit && (
              <Button onClick={() => save(true)} loading={busy} disabled={!projectId || !requiredByDate}>
                <Send className="h-3.5 w-3.5" />
                Submit for approval
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
