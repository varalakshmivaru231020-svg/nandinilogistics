"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatDateTime } from "@/lib/utils";
import { FileChip } from "@/components/ui/file-tag";
import {
  createArticleAction, deleteArticleAction, toggleArticlePublishedAction, updateArticleAction,
} from "./actions";

interface Article {
  id: string; title: string; summary: string | null; body: string;
  category: string | null; isPublished: boolean; author: string; updatedAt: string;
  attachments: Array<{ id: string; fileName: string; fileSize: number }>;
}

export function KbScreen({
  query, openId, articles, totalArticles, can,
}: {
  query: string;
  openId: string | null;
  articles: Article[];
  /** Every article, so the design's "N of M articles" can be shown. */
  totalArticles: number;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(query);
  const [editing, setEditing] = React.useState<Article | "new" | null>(null);
  const [removing, setRemoving] = React.useState<Article | null>(null);
  const toast = useToast();
  const setError = React.useCallback((m: string) => toast(m, "bad"), [toast]);
  const [busy, setBusy] = React.useState(false);

  function setParam(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") p.delete(k); else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  function flash(m: string) { toast(m); router.refresh(); }

  const open = openId ? articles.find((a) => a.id === openId) ?? null : null;

  async function togglePublish(a: Article) {
    const res = await toggleArticlePublishedAction(a.id);
    if (!res.ok) { setError(res.error); return; }
    flash(res.data.published ? `${a.title} published` : `${a.title} unpublished`);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await deleteArticleAction(removing.id);
    setBusy(false);
    if (!res.ok) { setError(res.error); setRemoving(null); return; }
    setRemoving(null);
    if (openId === removing.id) setParam({ open: undefined });
    flash(`${removing.title} deleted`);
  }

  /* ------------------------------ Article view ----------------------------- */
  if (open) {
    return (
      <div className="animate-fade-up">
        <div className="mb-3.5 flex flex-wrap items-start gap-3">
          <button
            type="button"
            onClick={() => setParam({ open: undefined })}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line-400 bg-white px-3.5 text-[12px] font-bold text-muted-600 transition-colors hover:bg-surface-hover hover:text-navy-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[19px] font-bold text-navy-950">{open.title}</span>
              {open.category && <Badge tone="slate">{open.category}</Badge>}
              {!open.isPublished && <Badge tone="warn">Draft</Badge>}
            </div>
            <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">
              {open.author} · updated {formatDate(open.updatedAt)}
            </p>
          </div>
          {can.publish && (
            <Button size="md" variant="secondary" onClick={() => togglePublish(open)}>
              {open.isPublished ? "Unpublish" : "Publish"}
            </Button>
          )}
          {can.update && (
            <Button size="md" onClick={() => setEditing(open)}>
              ✎ Edit
            </Button>
          )}
        </div>

        <Card className="px-5 py-5">
          {open.summary && (
            <p className="mb-3 border-l-[3px] border-brand-500 pl-3 text-[13px] font-semibold text-navy-800">
              {open.summary}
            </p>
          )}
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-navy-600">{open.body}</div>

          {open.attachments.length > 0 && (
            <div className="mt-4 border-t border-line-300 pt-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-400">Attachments</p>
              <ul className="mt-2 space-y-1.5">
                {open.attachments.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <FileChip fileName={f.fileName} />
                    <span className="num shrink-0 text-[11px] font-medium text-muted-500">
                      {Math.round(f.fileSize / 1024)} KB
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {editing && (
          <ArticleForm
            article={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={(m) => { setEditing(null); flash(m); }}
          />
        )}
      </div>
    );
  }

  /* -------------------------------- Library -------------------------------- */
  return (
    <div className="animate-fade-up">
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <form
          className="w-[280px] max-w-full"
          onSubmit={(e) => { e.preventDefault(); setParam({ q: q || undefined }); }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles…"
            className="bg-white"
          />
        </form>
        <span className="text-[12px] font-semibold text-muted-600">
          {articles.length} of {totalArticles} articles
        </span>
        <div className="flex-1" />
        {can.create && (
          <Button size="md" onClick={() => setEditing("new")}>
            + New article
          </Button>
        )}
      </div>

      {articles.length === 0 ? (
        <Card className="px-4 py-16 text-center">
          <p className="font-display text-[15px] font-bold text-navy-950">
            {query ? "Nothing matches that search." : "The knowledge base is empty."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
          {articles.map((a) => (
            <Card key={a.id} className="flex flex-col px-4 py-4 transition-shadow hover:shadow-[0_6px_18px_rgba(25,26,92,.08)]">
              <div className="flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  onClick={() => setParam({ open: a.id })}
                  className="min-w-0 flex-1 text-left font-display text-[14px] font-bold text-navy-950 transition-colors hover:text-brand-700"
                >
                  {a.title}
                </button>
                {!a.isPublished && <Badge tone="warn">Draft</Badge>}
              </div>

              <p className="mt-[7px] line-clamp-4 flex-1 text-[12.5px] font-medium leading-relaxed text-navy-500">
                {a.summary ?? a.body.slice(0, 180)}
              </p>

              {a.attachments.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {a.attachments.map((f) => (
                    <FileChip key={f.id} fileName={f.fileName} />
                  ))}
                </div>
              )}

              <p className="mt-[11px] text-[11px] font-semibold text-muted-400">
                {a.attachments.length} attachment{a.attachments.length === 1 ? "" : "s"} · {a.author} ·{" "}
                {formatDateTime(a.updatedAt)}
              </p>

              <div className="mt-[13px] flex gap-[7px]">
                <button
                  type="button"
                  onClick={() => setParam({ open: a.id })}
                  className="flex-1 rounded-[8px] border border-line-400 bg-white py-2 text-[11.5px] font-bold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-100"
                >
                  View
                </button>
                {can.update && (
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    className="rounded-[8px] border border-line-400 bg-white px-[13px] py-2 text-[11.5px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
                  >
                    Edit
                  </button>
                )}
                {can.remove && (
                  <button
                    type="button"
                    onClick={() => setRemoving(a)}
                    className="rounded-[8px] border border-bad-100 bg-bad-050 px-[13px] py-2 text-[11.5px] font-semibold text-bad-700 transition-colors hover:brightness-95"
                  >
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ArticleForm
          article={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); flash(m); }}
        />
      )}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Delete article?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Delete</Button>
          </>
        }
      >
        <p className="text-[12.5px] font-medium text-muted-600">
          “{removing?.title}” and its attachments will be removed for everyone.
        </p>
      </Modal>
    </div>
  );
}

function ArticleForm({
  article, onClose, onSaved,
}: {
  article: Article | null; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = article
      ? await updateArticleAction(article.id, fd)
      : await createArticleAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(article ? `${fd.get("title")} updated` : `${fd.get("title")} added`);
  }

  return (
    <Modal open onClose={onClose} title={article ? "Edit article" : "New article"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>}
        <Field label="Title" required>
          <Input name="title" defaultValue={article?.title} placeholder="e.g. Site safety induction" required autoFocus />
        </Field>
        <Field label="Category">
          <Input name="category" defaultValue={article?.category ?? ""} placeholder="e.g. Safety, Procurement, Sales" />
        </Field>
        <Field label="Summary" hint="One line, shown on the card and above the article.">
          <Input name="summary" defaultValue={article?.summary ?? ""} />
        </Field>
        <Field label="Body" required>
          <Textarea name="body" defaultValue={article?.body} rows={10} required />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{article ? "Save changes" : "Create article"}</Button>
        </div>
      </form>
    </Modal>
  );
}
