"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { money } from "@/lib/utils";
import { createIndentAction } from "../actions";

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

export function IndentForm({
  projects, items, canSubmit,
}: { projects: ProjectOpt[]; items: ItemOpt[]; canSubmit: boolean }) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [workPackageId, setWorkPackageId] = React.useState("");
  const [requiredByDate, setRequiredByDate] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([blankLine()]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const workPackages = projects.find((p) => p.id === projectId)?.workPackages ?? [];

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = itemById.get(itemId);
    updateLine(key, {
      itemId,
      // Pre-fill the standard rate so the indent carries a value from the start.
      estimatedRate: item ? String(item.standardRate) : "",
    });
  }

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.requestedQty) || 0) * (Number(l.estimatedRate) || 0),
    0,
  );

  async function save(submit: boolean) {
    setBusy(true);
    setError(null);

    const payload = {
      projectId,
      workPackageId: workPackageId || undefined,
      requiredByDate,
      purpose: purpose || undefined,
      remarks: remarks || undefined,
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
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setWorkPackageId(""); }} required>
                {projects.length === 0 && <option value="">No projects mapped to you</option>}
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </Select>
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
          {lines.map((line, idx) => {
            const item = itemById.get(line.itemId);
            const amount = (Number(line.requestedQty) || 0) * (Number(line.estimatedRate) || 0);

            return (
              <div key={line.key} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Line {idx + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
                      onChange={(e) => updateLine(line.key, { estimatedRate: e.target.value })}
                    />
                  </Field>

                  <Field label="Amount" className="sm:col-span-3">
                    <div className="num flex h-9 items-center justify-end rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-800">
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

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <span className="text-sm text-slate-500">Estimated value</span>
            <span className="num text-lg font-semibold text-slate-900">{money(total)}</span>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => save(false)} loading={busy} disabled={!projectId || !requiredByDate}>
          Save as draft
        </Button>
        {canSubmit && (
          <Button onClick={() => save(true)} loading={busy} disabled={!projectId || !requiredByDate}>
            <Send className="h-3.5 w-3.5" />
            Submit for approval
          </Button>
        )}
      </div>
    </div>
  );
}
