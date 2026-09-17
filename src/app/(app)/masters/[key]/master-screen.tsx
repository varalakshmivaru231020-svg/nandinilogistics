"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Power, Search, Trash2, Upload } from "lucide-react";

import type { MasterDef } from "@/lib/masters/types";
import { masterImportColumns } from "@/lib/masters/import";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ImportDialog } from "@/components/import/import-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Badge, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, qty } from "@/lib/utils";
import {
  createMasterAction,
  deleteMasterAction,
  importMastersAction,
  previewMasterImportAction,
  toggleMasterStatusAction,
  updateMasterAction,
} from "../actions";

type Row = Record<string, unknown>;
type Options = Record<string, Array<{ value: string; label: string }>>;

interface Capabilities {
  create: boolean;
  update: boolean;
  delete: boolean;
  toggleStatus: boolean;
  export: boolean;
  import: boolean;
}

export function MasterScreen({
  def,
  rows,
  options,
  total,
  page,
  pageSize,
  query,
  statusFilter,
  can,
}: {
  def: MasterDef;
  rows: Row[];
  options: Options;
  total: number;
  page: number;
  pageSize: number;
  query: string;
  statusFilter: string;
  can: Capabilities;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [editing, setEditing] = React.useState<Row | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Row | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function setParam(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in next)) sp.delete("page");
    router.push(`?${sp.toString()}`);
  }

  /* ------------------------------ row actions ----------------------------- */

  async function onToggle(row: Row) {
    setBusy(true);
    setError(null);
    const res = await toggleMasterStatusAction(def.key, String(row.id));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotice(`${row.name ?? "Record"} is now ${res.data.status.toLowerCase()}.`);
      router.refresh();
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    const res = await deleteMasterAction(def.key, String(deleting.id));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setDeleting(null);
    } else {
      setDeleting(null);
      setNotice("Record deleted.");
      router.refresh();
    }
  }

  /* -------------------------------- columns ------------------------------- */

  const columns: Column<Row>[] = [
    ...def.fields
      .filter((f) => f.inList)
      .map<Column<Row>>((f) => ({
        key: f.name,
        header: f.label,
        align: f.align ?? (f.type === "number" || f.type === "decimal" ? "right" : "left"),
        className: f.type === "number" || f.type === "decimal" ? "num" : undefined,
        render: (row) => {
          const v = row[f.name];

          if (f.type === "checkbox") {
            return v ? <Badge tone="good">Yes</Badge> : <span className="text-muted-400">No</span>;
          }
          if (f.type === "select") {
            // Prefer the joined relation label when the list config includes it.
            const relationKey = f.name.replace(/Id$/, "");
            const relation = row[relationKey] as Record<string, unknown> | null;
            if (relation && def.listRelations?.[relationKey]) {
              return String(relation[def.listRelations[relationKey]] ?? "—");
            }
            const opt = options[f.name]?.find((o) => o.value === String(v));
            return opt?.label ?? <span className="text-muted-400">—</span>;
          }
          if (v === null || v === undefined || v === "") {
            return <span className="text-muted-400">—</span>;
          }
          if (f.type === "decimal") return qty(v, 3);
          if (f.name === "code") return <span className="font-medium text-navy-950">{String(v)}</span>;
          return String(v);
        },
      })),
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (row) =>
        row.status === "ACTIVE" ? (
          <Badge tone="good">Active</Badge>
        ) : (
          <Badge tone="slate">Inactive</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      visible: can.update || can.delete || can.toggleStatus,
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          {can.update && (
            <button
              type="button"
              onClick={() => setEditing(row)}
              className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {can.toggleStatus && (
            <button
              type="button"
              onClick={() => onToggle(row)}
              disabled={busy}
              className={cn(
                "rounded p-1.5 hover:bg-surface-hover",
                row.status === "ACTIVE"
                  ? "text-muted-400 hover:text-warn-700"
                  : "text-muted-400 hover:text-good-600",
              )}
              title={row.status === "ACTIVE" ? "Deactivate" : "Activate"}
            >
              <Power className="h-3.5 w-3.5" />
            </button>
          )}
          {can.delete && (
            <button
              type="button"
              onClick={() => setDeleting(row)}
              className="rounded p-1.5 text-muted-400 hover:bg-bad-050 hover:text-bad-600"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* --------------------------------- render ------------------------------- */

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input
            defaultValue={query}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            className="pl-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
            }}
          />
        </div>

        <Select
          value={statusFilter}
          onChange={(e) => setParam({ status: e.target.value === "all" ? undefined : e.target.value })}
          className="w-36"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </Select>

        <div className="flex-1" />

        {can.import && (
          <Button variant="secondary" size="sm" onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        )}
        {can.export && (
          <ExportMenu
            href={(format) => exportHref(`/api/masters/${def.key}/export`, format, params)}
            disabled={total === 0}
          />
        )}
        {can.create && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New {def.singular}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty={
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-navy-900">
              {query ? "No matches" : `No ${def.label.toLowerCase()} yet`}
            </p>
            <p className="mt-1 text-xs text-muted-500">
              {query
                ? "Try a different search term."
                : can.create
                  ? `Create the first ${def.singular} to get started.`
                  : "Ask an administrator to add records here."}
            </p>
          </div>
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        buildHref={(p) => {
          const sp = new URLSearchParams(params.toString());
          sp.set("page", String(p));
          return `?${sp.toString()}`;
        }}
      />

      {(creating || editing) && (
        <MasterForm
          def={def}
          options={options}
          record={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setCreating(false);
            setEditing(null);
            setNotice(msg);
            setError(null);
            router.refresh();
          }}
        />
      )}

      {importing && (
        <ImportDialog
          title={`Import ${def.label.toLowerCase()}`}
          columns={masterImportColumns(def)}
          templateName={def.key}
          preview={(fd) => previewMasterImportAction(def.key, fd)}
          commit={(fd) => importMastersAction(def.key, fd)}
          onClose={() => setImporting(false)}
          onImported={(message) => {
            setImporting(false);
            setError(null);
            setNotice(message);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={busy}
        title={`Delete ${def.singular}?`}
        message={`This permanently removes "${String(deleting?.name ?? deleting?.code ?? "")}". If it is referenced by existing records the delete will be blocked — deactivate it instead.`}
      />
    </div>
  );
}

/* ------------------------------- the form -------------------------------- */

export function MasterForm({
  def,
  options,
  record,
  onClose,
  onSaved,
}: {
  def: MasterDef;
  options: Options;
  record: Row | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const isEdit = Boolean(record);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = isEdit
      ? await updateMasterAction(def.key, String(record!.id), formData)
      : await createMasterAction(def.key, formData);

    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(isEdit ? `${def.singular} updated.` : `${def.singular} created.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${def.singular}` : `New ${def.singular}`}
      description={def.description}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="master-form" loading={busy}>
            {isEdit ? "Save changes" : `Create ${def.singular}`}
          </Button>
        </>
      }
    >
      <form id="master-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          {def.fields.map((f) => {
            const value = record?.[f.name];
            const common = {
              name: f.name,
              required: f.required,
              placeholder: f.placeholder,
            };

            return (
              <Field
                key={f.name}
                label={f.label}
                required={f.required}
                hint={f.hint}
                className={f.colSpan === 2 || f.type === "textarea" ? "sm:col-span-2" : undefined}
              >
                {f.type === "textarea" ? (
                  <Textarea {...common} rows={3} defaultValue={(value as string) ?? ""} />
                ) : f.type === "select" ? (
                  <Select {...common} defaultValue={value === null || value === undefined ? "" : String(value)}>
                    <option value="">{f.required ? `Select ${f.label.toLowerCase()}…` : "— None —"}</option>
                    {(options[f.name] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "checkbox" ? (
                  <label className="flex h-9 items-center gap-2 text-sm text-navy-600">
                    <input
                      type="checkbox"
                      name={f.name}
                      defaultChecked={Boolean(value)}
                      className="h-4 w-4 rounded border-line-400 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-muted-500">Yes</span>
                  </label>
                ) : (
                  <Input
                    {...common}
                    type={f.type === "decimal" || f.type === "number" ? "number" : f.type}
                    step={f.type === "decimal" ? "any" : f.step}
                    min={f.min}
                    max={f.max}
                    defaultValue={value === null || value === undefined ? "" : String(value)}
                    className={f.uppercase ? "uppercase" : undefined}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
