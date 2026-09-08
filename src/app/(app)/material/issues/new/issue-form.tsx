"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { money, qty } from "@/lib/utils";
import { createIssueAction } from "../actions";

interface StockRow {
  itemId: string; storeId: string; code: string; name: string;
  uom: string; available: number; avgRate: number;
}

interface Line {
  key: string;
  itemId: string;
  issuedQty: string;
}

function blankLine(): Line {
  return { key: Math.random().toString(36).slice(2), itemId: "", issuedQty: "" };
}

export function IssueForm({
  projects, stores, recipients, stock, canViewValue,
}: {
  projects: Array<{ id: string; name: string; code: string; workPackages: Array<{ id: string; code: string; name: string }> }>;
  stores: Array<{ id: string; name: string; projectId: string | null }>;
  recipients: Array<{ id: string; name: string; designation: string | null }>;
  stock: StockRow[];
  canViewValue: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [workPackageId, setWorkPackageId] = React.useState("");
  const [issuedToId, setIssuedToId] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([blankLine()]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Stores serving the chosen project, plus any central store.
  const availableStores = React.useMemo(
    () => stores.filter((s) => s.projectId === projectId || s.projectId === null),
    [stores, projectId],
  );
  // The user's explicit pick, which may go stale when the project changes.
  const [storePick, setStorePick] = React.useState("");

  // Derived, so changing project silently falls back to a valid store rather
  // than round-tripping through an effect.
  const storeId =
    storePick && availableStores.some((s) => s.id === storePick)
      ? storePick
      : (availableStores[0]?.id ?? "");
  const setStoreId = setStorePick;

  const stockInStore = React.useMemo(
    () => stock.filter((s) => s.storeId === storeId),
    [stock, storeId],
  );
  const stockByItem = React.useMemo(
    () => new Map(stockInStore.map((s) => [s.itemId, s])),
    [stockInStore],
  );

  const workPackages = projects.find((p) => p.id === projectId)?.workPackages ?? [];

  const rows = lines.map((l) => {
    const s = stockByItem.get(l.itemId);
    const requested = Number(l.issuedQty) || 0;
    const over = s ? requested > s.available + 0.0001 : false;
    const value = s ? requested * s.avgRate : 0;
    return { l, s, requested, over, value };
  });

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  const hasError = rows.some((r) => r.over);
  const ready =
    projectId && storeId && issuedToId && rows.some((r) => r.l.itemId && r.requested > 0) && !hasError;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createIssueAction({
      projectId,
      storeId,
      workPackageId: workPackageId || undefined,
      issuedToId,
      purpose: purpose || undefined,
      remarks: remarks || undefined,
      items: rows
        .filter((r) => r.l.itemId && r.requested > 0)
        .map((r) => ({ itemId: r.l.itemId, issuedQty: r.requested })),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push("/material/issues");
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader><CardTitle>Issue</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required>
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setWorkPackageId(""); }}>
                {projects.length === 0 && <option value="">No projects mapped to you</option>}
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </Select>
            </Field>

            <Field label="Issue from store" required>
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {availableStores.length === 0 && <option value="">No store for this project</option>}
                {availableStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>

            <Field label="Issued to" required hint="They acknowledge receipt on the mobile app.">
              <Select value={issuedToId} onChange={(e) => setIssuedToId(e.target.value)}>
                <option value="">Select…</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.designation ? ` — ${r.designation}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Work package" hint="Ties consumption back to the activity.">
              <Select value={workPackageId} onChange={(e) => setWorkPackageId(e.target.value)}>
                <option value="">— Not specified —</option>
                {workPackages.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </Select>
            </Field>

            <Field label="Purpose" className="sm:col-span-2">
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
          {stockInStore.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              This store has no stock on hand. Post a goods receipt first.
            </p>
          ) : (
            <>
              {rows.map(({ l, s, over, value }, idx) => (
                <div key={l.key} className={`rounded-md border p-3 ${over ? "border-red-300 bg-red-50/40" : "border-slate-200"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Line {idx + 1}</span>
                    {lines.length > 1 && (
                      <button type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-12">
                    <Field label="Item" required className="sm:col-span-6">
                      <Select value={l.itemId}
                        onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, itemId: e.target.value } : x))}>
                        <option value="">Select an item in stock…</option>
                        {stockInStore.map((si) => (
                          <option key={si.itemId} value={si.itemId}>
                            {si.code} — {si.name} ({qty(si.available, 3)} {si.uom} available)
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label={`Quantity${s ? ` (${s.uom})` : ""}`} required className="sm:col-span-3">
                      <Input type="number" step="any" min={0} className="num text-right"
                        value={l.issuedQty}
                        onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, issuedQty: e.target.value } : x))} />
                    </Field>

                    <Field label={canViewValue ? "Value" : "Available"} className="sm:col-span-3">
                      <div className="num flex h-9 items-center justify-end rounded-md bg-slate-50 px-3 text-sm text-slate-700">
                        {canViewValue ? money(value) : s ? qty(s.available, 3) : "—"}
                      </div>
                    </Field>
                  </div>

                  {over && s && (
                    <p className="mt-2 text-xs text-red-600">
                      Only {qty(s.available, 3)} {s.uom} in this store.
                    </p>
                  )}
                </div>
              ))}

              {canViewValue && (
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
                  <span className="text-sm text-slate-500">Consumption value</span>
                  <span className="num text-lg font-semibold text-slate-900">{money(totalValue)}</span>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {hasError && <Badge tone="red">Reduce the highlighted quantities</Badge>}
        <Button onClick={save} loading={busy} disabled={!ready}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Issue material
        </Button>
      </div>
    </div>
  );
}
