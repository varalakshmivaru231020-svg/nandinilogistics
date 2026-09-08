"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, History, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";
import { deleteDocumentAction, uploadDocumentAction } from "./actions";

export interface DocumentRow {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  version: number;
  supersedesId: string | null;
  hasNewerVersion: boolean;
  expiryDate: string | null;
  createdAt: string;
  typeName: string;
  uploadedByName: string | null;
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsTab({
  projectId, documents, documentTypes, can, nowMs,
}: {
  projectId: string;
  documents: DocumentRow[];
  documentTypes: Array<{ id: string; name: string; requiresExpiry: boolean }>;
  can: Record<string, boolean>;
  nowMs: number;
}) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);
  const [superseding, setSuperseding] = React.useState<DocumentRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(doc: DocumentRow) {
    setBusy(doc.id);
    setError(null);
    const res = await deleteDocumentAction(doc.id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("Document deleted."); router.refresh(); }
  }

  // Only the newest version of each chain leads the list; older ones nest under it.
  const current = documents.filter((d) => !d.hasNewerVersion);
  const supersededBy = new Map<string, DocumentRow[]>();
  for (const d of documents) {
    if (d.supersedesId) {
      supersededBy.set(d.supersedesId, [...(supersededBy.get(d.supersedesId) ?? []), d]);
    }
  }

  function chainFor(doc: DocumentRow): DocumentRow[] {
    const older: DocumentRow[] = [];
    let cursor = doc.supersedesId;
    while (cursor) {
      const previous = documents.find((d) => d.id === cursor);
      if (!previous) break;
      older.push(previous);
      cursor = previous.supersedesId;
    }
    return older;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Document repository</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone="slate">{documents.length} file(s)</Badge>
            {can.upload && (
              <Button size="sm" onClick={() => { setSuperseding(null); setUploading(true); }}>
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {current.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No documents yet"
              description="Drawings, approvals, licences and agreements live here, with version history."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {current.map((doc) => {
                const older = chainFor(doc);
                const expired = doc.expiryDate ? new Date(doc.expiryDate).getTime() < nowMs : false;
                return (
                  <li key={doc.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{doc.title}</span>
                          <Badge tone="slate">{doc.typeName}</Badge>
                          {doc.version > 1 && <Badge tone="brand">v{doc.version}</Badge>}
                          {expired && <Badge tone="red">Expired</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {doc.fileName} · {readableSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                          {doc.uploadedByName && ` · ${doc.uploadedByName}`}
                          {doc.expiryDate && ` · expires ${formatDate(doc.expiryDate)}`}
                        </p>
                        {older.length > 0 && (
                          <details className="mt-1">
                            <summary className="flex cursor-pointer items-center gap-1 text-xs text-brand-600">
                              <History className="h-3 w-3" />
                              {older.length} earlier version(s)
                            </summary>
                            <ul className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-3">
                              {older.map((old) => (
                                <li key={old.id} className="flex items-center justify-between py-0.5">
                                  <span className="text-xs text-slate-500">
                                    v{old.version} · {old.fileName} · {formatDate(old.createdAt)}
                                  </span>
                                  {can.download && (
                                    <a href={`/api/documents/${old.id}`} className="text-xs text-brand-600 hover:underline">
                                      Download
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {can.download && (
                          <a href={`/api/documents/${doc.id}`}>
                            <Button size="xs" variant="secondary">
                              <Download className="h-3 w-3" />
                              Download
                            </Button>
                          </a>
                        )}
                        {can.version && (
                          <Button size="xs" variant="ghost"
                            onClick={() => { setSuperseding(doc); setUploading(true); }}>
                            <History className="h-3 w-3" />
                            New version
                          </Button>
                        )}
                        {can.delete && (
                          <button type="button" disabled={busy === doc.id} onClick={() => remove(doc)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {uploading && (
        <UploadModal
          projectId={projectId}
          documentTypes={documentTypes}
          superseding={superseding}
          onClose={() => { setUploading(false); setSuperseding(null); }}
          onDone={(m) => { setUploading(false); setSuperseding(null); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function UploadModal({
  projectId, documentTypes, superseding, onClose, onDone,
}: {
  projectId: string;
  documentTypes: Array<{ id: string; name: string; requiresExpiry: boolean }>;
  superseding: DocumentRow | null;
  onClose: () => void;
  onDone: (m: string) => void;
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
    else onDone(superseding ? `Uploaded as version ${res.data.version}.` : "Document uploaded.");
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
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
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
          <Select name="documentTypeId" required defaultValue="">
            <option value="">Select…</option>
            {documentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>

        <Field label="Expiry date" hint="For licences and certificates that lapse.">
          <Input name="expiryDate" type="date" />
        </Field>

        <Field label="File" required>
          <input
            type="file"
            name="file"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
        </Field>
      </form>
    </Modal>
  );
}
