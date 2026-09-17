"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  addCheckpointAction, deleteCategoryAction, deleteCheckpointAction, deleteChecklistAction,
  duplicateChecklistAction, moveCheckpointAction, saveCategoryAction, saveChecklistAction,
  updateCheckpointAction,
} from "./actions";

interface Category { id: string; code: string; name: string; description: string | null; count: number }
interface Checklist { id: string; name: string; version: string; checkpointCount: number }
interface Checkpoint { id: string; text: string; isMandatory: boolean }
interface Run {
  id: string; name: string; category: string; checkpoints: number; location: string;
  by: string; score: number; result: "PASS" | "FAIL"; state: "OPEN" | "CLOSED";
}

const TABS = [
  { key: "lib", label: "Checklist library" },
  { key: "runs", label: "Site inspections" },
];

export function ChecklistsScreen({
  tab, categories, activeCategoryId, checklists, activeListId, checkpoints, runs, compliance, can,
}: {
  tab: "lib" | "runs";
  categories: Category[];
  activeCategoryId: string | null;
  checklists: Checklist[];
  activeListId: string | null;
  checkpoints: Checkpoint[];
  runs: Run[];
  compliance: number | null;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [categoryForm, setCategoryForm] = React.useState<Category | "new" | null>(null);
  const [listForm, setListForm] = React.useState<Checklist | "new" | null>(null);
  const [newPoint, setNewPoint] = React.useState("");
  const [editingPoint, setEditingPoint] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // A failed inspection that has not been closed is an open snag.
  const openSnags = runs.filter((r) => r.result === "FAIL" && r.state !== "CLOSED").length;

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;
  const activeList = checklists.find((l) => l.id === activeListId) ?? null;

  function go(next: { tab?: string; category?: string; list?: string }) {
    const sp = new URLSearchParams();
    if (next.tab && next.tab !== "lib") sp.set("tab", next.tab);
    if (next.category) sp.set("category", next.category);
    if (next.list) sp.set("list", next.list);
    router.push(sp.toString() ? `/checklists?${sp.toString()}` : "/checklists");
  }

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    router.refresh();
  }

  const mandatory = checkpoints.filter((p) => p.isMandatory).length;

  return (
    <div className="animate-fade-up">
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-[7px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go({ tab: t.key })}
              className={cn(
                "rounded-full border px-[15px] py-[9px] text-[12px] font-semibold transition-colors",
                tab === t.key
                  ? "border-brand-500 bg-brand-100 text-brand-700"
                  : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-[11.5px] font-medium text-muted-600">
          {categories.length} categories · {categories.reduce((n, c) => n + c.count, 0)} checklists ·
          defined once at organisation level and reused across every project
        </p>
      </div>

      {tab === "lib" && (
        <div className="flex flex-wrap items-start gap-3.5">
          {/* Categories */}
          <div className="min-w-[200px] flex-[0_1_230px] rounded-[13px] border border-line-400 bg-white p-[9px]">
            <div className="flex items-center justify-between px-[11px] pb-[7px] pt-[9px]">
              <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Categories</span>
              {can.createCategory && (
                <button
                  type="button"
                  onClick={() => setCategoryForm("new")}
                  aria-label="New category"
                  className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-brand-100 text-[13px] font-extrabold text-brand-700 hover:brightness-95"
                >
                  +
                </button>
              )}
            </div>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => go({ tab, category: c.id })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-[9px] border px-[11px] py-2.5 text-left transition-colors",
                  c.id === activeCategoryId
                    ? "border-brand-500 bg-brand-100"
                    : "border-transparent hover:bg-surface-hover",
                )}
              >
                <span className={cn("text-[12.5px]", c.id === activeCategoryId ? "font-bold text-brand-700" : "font-semibold text-navy-600")}>
                  {c.name}
                </span>
                <span
                  className={cn(
                    "num rounded-full px-2 py-[3px] text-[10.5px] font-bold",
                    c.id === activeCategoryId ? "bg-[#CBE5F5] text-brand-700" : "bg-surface-field text-muted-500",
                  )}
                >
                  {c.count}
                </span>
              </button>
            ))}
            {categories.length === 0 && (
              <p className="px-[11px] py-4 text-center text-[12px] font-medium text-muted-300">
                No categories yet
              </p>
            )}
          </div>

          {/* Checklists in the category */}
          <div className="min-w-[240px] flex-[1_1_260px] rounded-[13px] border border-line-400 bg-white px-4 py-[15px]">
            {activeCategory ? (
              <>
                <div className="flex flex-wrap items-start gap-[9px]">
                  <div className="min-w-0 flex-[1_1_140px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-bold text-navy-950">{activeCategory.name}</span>
                      <span className="rounded-full border border-line-350 bg-surface-hover px-2 py-[3px] text-[9.5px] font-extrabold tracking-[.07em] text-navy-800">
                        {activeCategory.code}
                      </span>
                    </div>
                    <p className="mt-[3px] text-[11.5px] font-medium text-muted-400">
                      {activeCategory.description ?? "No description"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {can.updateCategory && (
                      <IconButton label="Edit category" onClick={() => setCategoryForm(activeCategory)}>✎</IconButton>
                    )}
                    {can.deleteCategory && (
                      <IconButton
                        label="Delete category"
                        danger
                        onClick={() => run(() => deleteCategoryAction(activeCategory.id), "Category deleted")}
                      >
                        🗑
                      </IconButton>
                    )}
                  </div>
                </div>

                {categoryForm && (
                  <InlineForm
                    title={categoryForm === "new" ? "New category" : "Edit category"}
                    onCancel={() => setCategoryForm(null)}
                    onSubmit={async (fd) => {
                      await run(
                        () => saveCategoryAction(categoryForm === "new" ? null : categoryForm.id, fd),
                        categoryForm === "new" ? "Category added" : "Category updated",
                      );
                      setCategoryForm(null);
                    }}
                    busy={busy}
                    fields={[
                      { name: "name", label: "Category name", required: true, placeholder: "e.g. Fire fighting", defaultValue: categoryForm === "new" ? "" : categoryForm.name },
                      { name: "code", label: "Short code", placeholder: "FFS", defaultValue: categoryForm === "new" ? "" : categoryForm.code },
                      { name: "description", label: "Description", placeholder: "What this category covers", defaultValue: categoryForm === "new" ? "" : (categoryForm.description ?? "") },
                    ]}
                  />
                )}

                <div className="mb-[9px] mt-3.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Checklists</span>
                  {can.create && (
                    <button
                      type="button"
                      onClick={() => setListForm("new")}
                      className="whitespace-nowrap rounded-[7px] border border-line-400 bg-white px-[11px] py-[7px] text-[11px] font-bold text-brand-700 hover:border-brand-500 hover:bg-brand-100"
                    >
                      + New
                    </button>
                  )}
                </div>

                {listForm && (
                  <InlineForm
                    title={listForm === "new" ? "New checklist" : "Edit checklist"}
                    onCancel={() => setListForm(null)}
                    onSubmit={async (fd) => {
                      await run(
                        () => saveChecklistAction(listForm === "new" ? null : listForm.id, activeCategory.id, fd),
                        listForm === "new" ? "Checklist added" : "Checklist updated",
                      );
                      setListForm(null);
                    }}
                    busy={busy}
                    fields={[
                      { name: "name", label: "Checklist name", required: true, placeholder: "e.g. Column casting QC", defaultValue: listForm === "new" ? "" : listForm.name },
                      { name: "version", label: "Version", placeholder: "v1.0", defaultValue: listForm === "new" ? "" : listForm.version },
                    ]}
                  />
                )}

                <div className="flex flex-col gap-2">
                  {checklists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => go({ tab, category: activeCategory.id, list: l.id })}
                      className={cn(
                        "rounded-[11px] border px-3 py-2.5 text-left transition-colors",
                        l.id === activeListId
                          ? "border-brand-500 bg-brand-100"
                          : "border-line-400 bg-white hover:border-brand-500",
                      )}
                    >
                      <div className={cn("text-[12.5px]", l.id === activeListId ? "font-bold text-brand-700" : "font-semibold text-navy-900")}>
                        {l.name}
                      </div>
                      <div className="mt-[3px] text-[11px] font-medium text-muted-400">
                        {l.checkpointCount} checkpoint{l.checkpointCount === 1 ? "" : "s"} · {l.version}
                      </div>
                    </button>
                  ))}
                  {checklists.length === 0 && (
                    <p className="py-[18px] text-center text-[12px] font-medium text-muted-300">
                      No checklist in this category yet — use + New
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="py-[18px] text-center text-[12px] font-medium text-muted-300">
                Add a category to begin
              </p>
            )}
          </div>

          {/* Checkpoints */}
          <div className="min-w-[280px] flex-[2_1_340px] overflow-hidden rounded-[13px] border border-line-400 bg-white">
            {activeList ? (
              <>
                <div className="flex flex-wrap items-start gap-2.5 border-b border-line-200 px-[18px] py-[15px]">
                  <div className="min-w-0 flex-[1_1_180px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-bold text-navy-950">{activeList.name}</span>
                      <span className="rounded-full bg-surface-hover px-2 py-[3px] text-[10px] font-bold text-navy-800">
                        {activeList.version}
                      </span>
                    </div>
                    <p className="mt-[3px] text-[11.5px] font-medium text-muted-400">
                      {activeCategory?.name} · {checkpoints.length} checkpoint{checkpoints.length === 1 ? "" : "s"} · {mandatory} mandatory
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {can.update && (
                      <SmallButton onClick={() => setListForm(activeList)}>✎ Rename</SmallButton>
                    )}
                    {can.create && (
                      <SmallButton onClick={() => run(() => duplicateChecklistAction(activeList.id), "Checklist duplicated")}>
                        ⧉ Duplicate
                      </SmallButton>
                    )}
                    {can.delete && (
                      <SmallButton danger onClick={() => run(() => deleteChecklistAction(activeList.id), "Checklist deleted")}>
                        🗑 Delete
                      </SmallButton>
                    )}
                  </div>
                </div>

                <div className="px-[18px] py-3">
                  {can.update && (
                    <div className="mb-3 flex gap-2">
                      <Input
                        value={newPoint}
                        onChange={(e) => setNewPoint(e.target.value)}
                        placeholder="Add the next checkpoint — it takes the next sequence number"
                        className="flex-1 bg-white"
                      />
                      <Button
                        loading={busy}
                        disabled={!newPoint.trim()}
                        onClick={async () => {
                          await run(() => addCheckpointAction(activeList.id, newPoint, true), "Checkpoint added");
                          setNewPoint("");
                        }}
                      >
                        + Add checkpoint
                      </Button>
                    </div>
                  )}

                  {checkpoints.length === 0 && (
                    <p className="px-5 py-[30px] text-center text-[12.5px] font-medium text-muted-400">
                      No checkpoints yet. Add them in the order the inspector should follow on site —
                      the sequence number is what appears on the mobile form.
                    </p>
                  )}

                  {checkpoints.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-[11px] border-b border-line-200 py-3 last:border-0">
                      <span className="num shrink-0 rounded-[8px] bg-brand-100 px-[9px] py-1.5 font-display text-[12px] font-extrabold text-brand-700">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {editingPoint === p.id ? (
                        <form
                          className="flex flex-1 items-center gap-2"
                          action={async (fd) => {
                            await run(
                              () => updateCheckpointAction(p.id, { text: String(fd.get("text") ?? "") }),
                              "Checkpoint updated",
                            );
                            setEditingPoint(null);
                          }}
                        >
                          <Input name="text" defaultValue={p.text} autoFocus className="flex-1" />
                          <Button type="submit" size="sm" loading={busy}>Save</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setEditingPoint(null)}>
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <>
                          <span className="flex-1 text-[12.5px] font-medium text-navy-900">{p.text}</span>
                          {can.update && (
                            <button
                              type="button"
                              onClick={() => run(() => updateCheckpointAction(p.id, { isMandatory: !p.isMandatory }), "Checkpoint updated")}
                              className={cn(
                                "rounded-full px-2 py-[3px] text-[8.5px] font-extrabold uppercase tracking-[.07em] text-white",
                                p.isMandatory ? "bg-bad-600" : "bg-muted-400",
                              )}
                            >
                              {p.isMandatory ? "Mandatory" : "Optional"}
                            </button>
                          )}
                          {can.update && (
                            <button
                              type="button"
                              onClick={() => setEditingPoint(p.id)}
                              className="text-[11px] font-semibold text-brand-700 hover:underline"
                            >
                              Edit text
                            </button>
                          )}
                          {can.update && (
                            <>
                              <IconButton label="Move up" onClick={() => run(() => moveCheckpointAction(p.id, "up"), "Moved")}>↑</IconButton>
                              <IconButton label="Move down" onClick={() => run(() => moveCheckpointAction(p.id, "down"), "Moved")}>↓</IconButton>
                              <IconButton label="Delete checkpoint" danger onClick={() => run(() => deleteCheckpointAction(p.id), "Checkpoint removed")}>🗑</IconButton>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                </div>
              </>
            ) : (
              <p className="px-[18px] py-10 text-center text-[12px] font-medium text-muted-300">
                Pick a checklist to see its checkpoints
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "runs" && (
        <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line-200 px-[18px] py-[15px]">
            <p className="font-display text-[14px] font-bold text-navy-950">Recent inspections</p>
            {compliance !== null && (
              <p className="text-[11.5px] font-semibold text-muted-600">
                Compliance this month <span className="num font-extrabold text-good-600">{compliance}%</span>
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line-200 px-[18px] py-[13px] last:border-0">
                <div className="min-w-0 flex-[1_1_190px]">
                  <p className="text-[13px] font-semibold text-navy-900">{r.name}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-400">
                    {r.checkpoints} checkpoints · {r.category}
                  </p>
                </div>
                <div className="min-w-0 flex-[1_1_160px] text-[12px] font-medium text-navy-500">
                  {r.location}
                  <br />
                  <span className="text-[11px] text-muted-400">by {r.by}</span>
                </div>
                <div className="min-w-[110px] flex-[0_1_130px]">
                  <div className="mb-1 flex justify-between text-[11px] font-bold text-navy-600">
                    <span>Score</span>
                    <span className="num">{r.score}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-track">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        r.score < 80
                          ? "bg-[linear-gradient(90deg,#D8494A,#E8827F)]"
                          : "bg-[linear-gradient(90deg,#0089C9,#5BC8F2)]",
                      )}
                      style={{ width: `${r.score}%` }}
                    />
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", r.result === "PASS" ? "bg-good-050 text-good-700" : "bg-bad-050 text-bad-700")}>
                  {r.result === "PASS" ? "Pass" : "Fail"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold",
                    r.state === "CLOSED"
                      ? "bg-surface-hover text-navy-800"
                      : r.result === "FAIL"
                        ? "bg-bad-050 text-bad-700"
                        : "bg-warn-050 text-warn-800",
                  )}
                >
                  {r.state === "CLOSED" ? "Closed" : r.result === "FAIL" ? "Snag raised" : "Awaiting PM verify"}
                </span>
              </div>
            ))}
            {runs.length === 0 && (
              <p className="px-[18px] py-10 text-center text-[12px] font-medium text-muted-300">
                No inspections recorded yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* The design says out loud what a failed inspection costs. */}
      {tab === "runs" && openSnags > 0 && (
        <div className="mt-3.5 rounded-[12px] border border-amber-200 bg-warn-050 px-[17px] py-3.5 text-[12px] font-bold text-warn-800">
          ⚠ {openSnags} failed inspection{openSnags === 1 ? "" : "s"} raised a snag — the checklist
          stays open until it is cleared.
        </div>
      )}
    </div>
  );
}

function IconButton({
  children, onClick, label, danger,
}: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-line-400 bg-white text-[12px] font-bold text-muted-600",
        danger ? "hover:border-bad-600 hover:text-bad-600" : "hover:border-brand-500 hover:text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

function SmallButton({
  children, onClick, danger,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[7px] border px-[11px] py-[7px] text-[11px] font-bold",
        danger
          ? "border-bad-100 bg-bad-050 text-bad-700 hover:brightness-95"
          : "border-line-400 bg-white text-brand-700 hover:border-brand-500 hover:bg-brand-100",
      )}
    >
      {children}
    </button>
  );
}

function InlineForm({
  title, fields, onSubmit, onCancel, busy,
}: {
  title: string;
  fields: Array<{ name: string; label: string; required?: boolean; placeholder?: string; defaultValue?: string }>;
  onSubmit: (fd: FormData) => void | Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <form action={onSubmit} className="mt-3 rounded-[11px] border border-brand-150 bg-surface-sunken px-3.5 py-[13px]">
      <p className="mb-2.5 text-[12.5px] font-bold text-navy-950">{title}</p>
      <div className="flex flex-col gap-2.5">
        {fields.map((f) => (
          <div key={f.name}>
            <p className="mb-[5px] text-[11px] font-semibold text-muted-600">
              {f.label}
              {f.required && <span className="text-bad-600"> *</span>}
            </p>
            <Input
              name={f.name}
              defaultValue={f.defaultValue}
              placeholder={f.placeholder}
              required={f.required}
              className="bg-white"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>Save</Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
