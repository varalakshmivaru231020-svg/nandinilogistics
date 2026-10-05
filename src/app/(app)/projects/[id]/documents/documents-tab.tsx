"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import { documentChains } from "@/lib/projects/document-chains";
import { deleteDocumentAction, updateDocumentAction, uploadDocumentAction } from "./actions";

export interface DocumentRow {
  id: string;
  title: string;
  fileName: string;
  version: number;
  supersedesId: string | null;
  hasNewerVersion: boolean;
  createdAt: string;
  typeId: string;
  typeName: string;
  access: string | null;
  uploadedByName: string | null;
}

/** The design's kinds, and the colour each one carries. */
const TAG_TONE: Record<string, string> = {
  DRAWING: "bg-brand-100 text-brand-700",
  LICENCE: "bg-good-050 text-good-700",
  APPROVAL: "bg-plum-050 text-plum-600",
  AGREEMENT: "bg-warn-050 text-warn-700",
  REPORT: "bg-slate-050 text-slate-600",
  CONTRACT: "bg-bad-050 text-bad-700",
};

function tagOf(typeName: string): { label: string; tone: string } {
  const label = typeName.toUpperCase();
  for (const key of Object.keys(TAG_TONE)) {
    if (label.includes(key)) return { label: key, tone: TAG_TONE[key] };
  }
  return { label: label.slice(0, 12), tone: "bg-slate-050 text-slate-600" };
}

export function DocumentsTab({
  projectId, documents, documentTypes, can,
}: {
  projectId: string;
  documents: DocumentRow[];
  documentTypes: Array<{ id: string; name: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);
  const [superseding, setSuperseding] = React.useState<DocumentRow | null>(null);
  const [editing, setEditing] = React.useState<DocumentRow | null>(null);
  const [confirming, setConfirming] = React.useState<DocumentRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Every version is listed: the one in force leads its chain and the ones it
  // replaced sit under it, newest first. They were always stored and never
  // deletable — they just had nowhere to be seen.
  const chains = documentChains(documents);

  async function remove() {
    if (!confirming) return;
    setBusy(true);
    const res = await deleteDocumentAction(confirming.id);
    setBusy(false);
    setConfirming(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Document repository · {chains.length} files
        </div>
        {can.upload && (
          <button
            type="button"
            onClick={() => { setSuperseding(null); setUploading(true); }}
            className="cursor-pointer rounded-[8px] bg-brand-500 px-3 py-[7px] text-[11px] font-bold text-white transition-colors hover:bg-brand-600"
          >
            ↑ Upload
          </button>
        )}
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}

      {chains.map(({ current: d, older }) => {
        const tag = tagOf(d.typeName);
        return (
          <div key={d.id} className="border-b border-line-100 py-2.5 last:border-0">
          <div className="flex items-center gap-[11px] hover:bg-surface-tint">
            <span className={cn("rounded-full px-[9px] py-1 text-[9px] font-bold tracking-[.06em]", tag.tone)}>
              {tag.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-navy-900">
                {can.download ? (
                  <a href={`/api/documents/${d.id}`} className="hover:text-brand-600">{d.title}</a>
                ) : (
                  d.title
                )}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                v{d.version} · {formatDate(d.createdAt)}
                {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-surface-field px-[9px] py-1 text-[10.5px] font-semibold text-muted-500">
              {d.access || "All roles · view"}
            </span>
            {can.version && (
              <button
                type="button"
                onClick={() => { setSuperseding(d); setUploading(true); }}
                className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
              >
                + Version
              </button>
            )}
            {can.upload && (
              <button
                type="button"
                onClick={() => setEditing(d)}
                className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
              >
                Edit
              </button>
            )}
            {can.delete && (
              <button
                type="button"
                onClick={() => setConfirming(d)}
                className="shrink-0 cursor-pointer px-1 py-0.5 text-[13px] font-semibold text-[#C0C5DC] transition-colors hover:text-bad-600"
              >
                ✕
              </button>
            )}
          </div>

          {older.length > 0 && (
            <div className="mt-1.5 pl-[58px]">
              {older.map((o) => (
                <div key={o.id} className="flex items-center gap-2 py-[3px] text-[11px] font-medium text-muted-400">
                  <span className="shrink-0 rounded-full bg-surface-field px-[7px] py-px text-[9.5px] font-bold text-muted-500">
                    v{o.version}
                  </span>
                  {can.download ? (
                    <a href={`/api/documents/${o.id}`} className="truncate hover:text-brand-600">
                      {o.title}
                    </a>
                  ) : (
                    <span className="truncate">{o.title}</span>
                  )}
                  <span className="shrink-0">· {formatDate(o.createdAt)}</span>
                  {o.uploadedByName && <span className="shrink-0 truncate">· {o.uploadedByName}</span>}
                </div>
              ))}
            </div>
          )}
          </div>
        );
      })}

      {chains.length === 0 && (
        <div className="py-6 text-center text-[12px] font-medium text-muted-400">
          Drawings, approvals, licences and agreements live here, with version history.
        </div>
      )}

      <div className="mt-[9px] text-[11px] font-medium text-muted-400">
        Version history kept per document · access is role-based
      </div>

      {uploading && (
        <UploadModal
          projectId={projectId}
          documentTypes={documentTypes}
          superseding={superseding}
          onClose={() => { setUploading(false); setSuperseding(null); }}
          onDone={() => { setUploading(false); setSuperseding(null); router.refresh(); }}
        />
      )}

      {editing && (
        <EditModal
          doc={editing}
          documentTypes={documentTypes}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh(); }}
        />
      )}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Delete "${confirming.title}"?` : ""}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(null)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">The file and its record go. It cannot be undone.</p>
      </Modal>
    </div>
  );
}

/** Who may open a document, in the words the repository shows. */
const ACCESS_CHOICES = [
  "All roles · view",
  "PM · Supervisor",
  "PM · Engineers",
  "Owner · PM",
  "Owner only",
];

function UploadModal({
  projectId, documentTypes, superseding, onClose, onDone,
}: {
  projectId: string;
  documentTypes: Array<{ id: string; name: string }>;
  superseding: DocumentRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (superseding) fd.set("supersedesId", superseding.id);
    const res = await uploadDocumentAction(projectId, fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={superseding ? `New version of "${superseding.title}"` : "Upload a document"}
      description={
        superseding
          ? "The earlier version stays readable — nothing is overwritten."
          : "PDF, image, drawing or Office document, up to 25 MB."
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="upload-form" loading={busy}>Upload</Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Title" required>
          <Input name="title" required defaultValue={superseding?.title ?? ""} />
        </Field>

        <Field label="Document type" required>
          <Select name="documentTypeId" required defaultValue={superseding?.typeId ?? ""}>
            <option value="">Select…</option>
            {documentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>

        <Field label="Access">
          <Select name="access" defaultValue={superseding?.access ?? ACCESS_CHOICES[0]}>
            {ACCESS_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>

        <Field label="File" required>
          <input
            type="file"
            name="file"
            required
            className="block w-full text-sm text-muted-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
        </Field>
      </form>
    </Modal>
  );
}

function EditModal({
  doc, documentTypes, onClose, onDone,
}: {
  doc: DocumentRow;
  documentTypes: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState(doc.title);
  const [typeId, setTypeId] = React.useState(doc.typeId);
  const [access, setAccess] = React.useState(doc.access ?? ACCESS_CHOICES[0]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateDocumentAction(doc.id, { title, documentTypeId: typeId, access });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit "${doc.title}"`}
      description="The stored file is unchanged — a new file is a new version."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Document type" required>
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {documentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Access">
          <Select value={access} onChange={(e) => setAccess(e.target.value)}>
            {ACCESS_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
