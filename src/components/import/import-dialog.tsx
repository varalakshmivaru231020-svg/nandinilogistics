"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge } from "@/components/ui/primitives";
import {
  templateCsv, type ImportColumn, type ImportPlan, type ImportSummary,
} from "@/lib/import/columns";
import type { ActionResult } from "@/lib/rbac/guard";

/**
 * Upload → preview → import, for any importer.
 *
 * Nothing is written until the user has seen what every row will do. The
 * preview is a courtesy: the import action checks the file again on its own.
 */
export function ImportDialog({
  title,
  description,
  columns,
  templateName,
  preview,
  commit,
  onClose,
  onImported,
}: {
  title: string;
  description?: string;
  columns: ImportColumn[];
  /** File name stem for the template download, e.g. "leads". */
  templateName: string;
  preview: (formData: FormData) => Promise<ActionResult<ImportPlan>>;
  commit: (formData: FormData) => Promise<ActionResult<ImportSummary>>;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "import" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  function formFor(f: File) {
    const fd = new FormData();
    fd.set("file", f);
    return fd;
  }

  async function choose(f: File | null) {
    setFile(f);
    setPlan(null);
    setError(null);
    setShowAll(false);
    if (!f) return;
    setBusy("preview");
    const res = await preview(formFor(f));
    setBusy(null);
    if (!res.ok) setError(res.error);
    else setPlan(res.data);
  }

  async function runImport() {
    if (!file) return;
    setBusy("import");
    setError(null);
    const res = await commit(formFor(file));
    setBusy(null);
    if (!res.ok) setError(res.error);
    else onImported(res.data.message);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv(columns)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const problems = plan?.rows.filter((r) => r.errors.length > 0) ?? [];
  const noted = plan?.rows.filter((r) => r.errors.length === 0 && (r.notes?.length ?? 0) > 0) ?? [];
  const shownProblems = showAll ? problems : problems.slice(0, 50);
  const canImport = Boolean(plan && plan.missing.length === 0 && plan.valid > 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description ?? "Upload a .csv or .xlsx file. Every row is checked before anything is saved."}
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={runImport} loading={busy === "import"} disabled={!canImport || busy !== null}>
            {plan && plan.valid > 0 ? `Import ${plan.valid.toLocaleString("en-IN")} row${plan.valid === 1 ? "" : "s"}` : "Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-[9px] border border-dashed border-brand-300 bg-brand-100/40 px-4 py-2.5 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-100">
            <FileUp className="h-4 w-4" />
            {file ? file.name : "Choose file…"}
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              disabled={busy !== null}
            />
          </label>
          <Button variant="ghost" size="sm" type="button" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" />
            Template
          </Button>
          {busy === "preview" && <span className="text-xs text-muted-500">Checking every row…</span>}
        </div>

        <details className="rounded-[10px] border border-line-300 bg-surface-sunken px-3 py-2 text-xs text-muted-600">
          <summary className="cursor-pointer font-semibold text-navy-700">Columns this import reads</summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {columns.map((c) => (
              <li key={c.key}>
                <span className="font-semibold text-navy-900">{c.label}</span>
                {c.required && <span className="text-bad-600"> *</span>}
                {c.hint && <span className="text-muted-400"> — {c.hint}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-400">Header names are matched without regard to case or spacing. Dates may be written 05/04/2026 (day first) or 2026-04-05.</p>
        </details>

        {plan && plan.missing.length > 0 && (
          <Alert tone="error">The file has no column for: {plan.missing.join(", ")}. Add it and choose the file again.</Alert>
        )}

        {plan && plan.missing.length === 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good"><CheckCircle2 className="mr-1 inline h-3 w-3" />{plan.valid} ready</Badge>
            {plan.invalid > 0 && (
              <Badge tone="bad"><AlertTriangle className="mr-1 inline h-3 w-3" />{plan.invalid} with problems — skipped</Badge>
            )}
            {noted.length > 0 && <Badge tone="warn">{noted.length} flagged</Badge>}
            {plan.ignored.length > 0 && (
              <span className="text-xs text-muted-500">Not read: {plan.ignored.join(", ")}</span>
            )}
          </div>
        )}

        {problems.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-[10px] border border-line-300">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2 font-bold text-muted-500">Row</th>
                  <th className="px-3 py-2 font-bold text-muted-500">Record</th>
                  <th className="px-3 py-2 font-bold text-muted-500">Problem</th>
                </tr>
              </thead>
              <tbody>
                {shownProblems.map((r) => (
                  <tr key={r.row} className="border-t border-line-200 align-top">
                    <td className="num px-3 py-2 text-muted-500">{r.row}</td>
                    <td className="px-3 py-2 font-medium text-navy-900">{r.label}</td>
                    <td className="px-3 py-2 text-bad-600">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {problems.length > shownProblems.length && (
              <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-line-200 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-hover">
                Show all {problems.length} problems
              </button>
            )}
          </div>
        )}

        {noted.length > 0 && (
          <div className="rounded-[10px] border border-warn-050 bg-warn-050/40 px-3 py-2 text-xs text-warn-700">
            <p className="mb-1 flex items-center gap-1 font-semibold"><Info className="h-3.5 w-3.5" /> Will be imported, but worth a look</p>
            <ul className="space-y-0.5">
              {noted.slice(0, 20).map((r) => (
                <li key={r.row}>Row {r.row} · {r.label}: {r.notes!.join("; ")}</li>
              ))}
              {noted.length > 20 && <li>…and {noted.length - 20} more</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
