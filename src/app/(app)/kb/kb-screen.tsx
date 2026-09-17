"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Card, Field, Input } from "@/components/ui/primitives";
import { richTextToPlain } from "@/lib/rich-text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
/** The design stamps an article in figures: 02/09/2026, 11:20. */
function stamp(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
import { FileChip } from "@/components/ui/file-tag";
import {
  createArticleAction, deleteArticleAction, updateArticleAction,
} from "./actions";

/** The design's toolbar, in its order. */
const TOOLS: Array<{ label: React.ReactNode; command: string; value?: string; title: string }> = [
  { label: <b>B</b>, command: "bold", title: "Bold" },
  { label: <i>I</i>, command: "italic", title: "Italic" },
  { label: <u>U</u>, command: "underline", title: "Underline" },
  { label: "• List", command: "insertUnorderedList", title: "Bulleted list" },
  { label: "1. List", command: "insertOrderedList", title: "Numbered list" },
  { label: <b>H</b>, command: "formatBlock", value: "<h3>", title: "Heading" },
  { label: "🔗", command: "createLink", title: "Link" },
  { label: "⌫ Clear", command: "removeFormat", title: "Clear formatting" },
];

/**
 * The design's description box: a small toolbar over a writing area, with what
 * was written kept in a hidden field so the form posts it like any other value.
 *
 *   B · I · U · • List · 1. List · H · link · ⌫ Clear
 */
function RichText({ name, defaultValue }: { name: string; defaultValue: string }) {
  const area = React.useRef<HTMLDivElement>(null);
  const [html, setHtml] = React.useState(defaultValue);

  // execCommand is the only editing API every browser still agrees on, and the
  // toolbar is exactly the set of commands the design draws.
  function run(command: string, value?: string) {
    const el = area.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    setHtml(el.innerHTML);
  }

  function link() {
    const url = window.prompt("Link to");
    if (url) run("createLink", url);
  }

  return (
    <div className="overflow-hidden rounded-[9px] border border-line-400 bg-white">
      <div className="flex flex-wrap gap-[5px] border-b border-line-200 bg-surface-sunken px-[9px] py-2">
        {TOOLS.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (t.command === "createLink" ? link() : run(t.command, t.value))}
            className="min-w-[30px] cursor-pointer rounded-[7px] border border-line-400 bg-white px-[10px] py-1.5 text-[11.5px] font-semibold text-navy-600 transition-colors hover:border-brand-500 hover:text-brand-700"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        ref={area}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setHtml(area.current?.innerHTML ?? "")}
        className="min-h-[150px] max-h-[280px] overflow-y-auto px-[13px] py-3 text-[12.5px] font-medium leading-[1.65] text-navy-900 outline-none"
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

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
    const viewable = (name: string) => /\.(pdf|png|jpe?g|gif|webp|svg|txt)$/i.test(name);
    return (
      <div className="animate-fade-up">
        <div className="mb-3.5 flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            onClick={() => setParam({ open: undefined })}
            className="cursor-pointer rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
          >
            ← All articles
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[19px] font-bold text-navy-950">{open.title}</div>
            <p className="mt-[3px] text-[12px] font-medium text-muted-500">
              {open.attachments.length} {open.attachments.length === 1 ? "attachment" : "attachments"}
              {" · last updated by "}{open.author} · {stamp(open.updatedAt)}
            </p>
          </div>
          {can.update && (
            <button
              type="button"
              onClick={() => setEditing(open)}
              className="cursor-pointer rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              ✎ Edit
            </button>
          )}
          {can.delete && (
            <button
              type="button"
              onClick={() => setRemoving(open)}
              className="cursor-pointer rounded-[9px] border border-bad-100 bg-bad-050 px-4 py-2.5 text-[12.5px] font-semibold text-bad-700 transition-colors hover:bg-bad-100"
            >
              Delete
            </button>
          )}
        </div>

        <div className="mb-3.5 rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Attachments · {open.attachments.length} {open.attachments.length === 1 ? "attachment" : "attachments"}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {open.attachments.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2.5 rounded-[10px] border border-line-300 bg-surface-sunken px-3 py-2.5"
              >
                <FileChip fileName={f.fileName} />
                <span className="num shrink-0 text-[11px] font-medium text-muted-500">
                  {Math.round(f.fileSize / 1024)} KB
                </span>
                {viewable(f.fileName) && (
                  <a
                    href={`/api/kb/attachments/${f.id}`}
                    target="_blank"
                    rel="noopener"
                    className="rounded-[7px] bg-brand-500 px-[11px] py-1.5 text-[10.5px] font-bold text-white transition-colors hover:bg-brand-600"
                  >
                    View
                  </a>
                )}
                <a
                  href={`/api/kb/attachments/${f.id}?download=1`}
                  title={`Download ${f.fileName}`}
                  className="rounded-[7px] border border-line-400 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
                >
                  ↓
                </a>
              </div>
            ))}
            {open.attachments.length === 0 && (
              <div className="py-2 text-[12px] font-medium text-muted-400">Nothing attached to this article.</div>
            )}
          </div>
        </div>

        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Description</div>
          {open.summary && (
            <p className="mb-3 border-l-[3px] border-brand-500 pl-3 text-[13px] font-semibold text-navy-800">
              {open.summary}
            </p>
          )}
          {/* Written with the design's toolbar and cut to its tags before it was
              stored, so what is rendered here is only what that toolbar makes. */}
          <div
            className="kb-body whitespace-pre-wrap text-[13px] leading-relaxed text-navy-600"
            dangerouslySetInnerHTML={{ __html: open.body }}
          />
        </div>

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
              </div>

              <p className="mt-[7px] line-clamp-4 flex-1 text-[12.5px] font-medium leading-relaxed text-navy-500">
                {a.summary ?? richTextToPlain(a.body).slice(0, 180)}
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
                {stamp(a.updatedAt)}
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
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
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
  const [files, setFiles] = React.useState<string[]>([]);

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
    <Drawer
      open
      onClose={onClose}
      title={article ? "Edit article" : "New article"}
      description="Name, description and any number of attachments"
      size="base"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="article-form" loading={busy} className="px-[18px]">
            {article ? "Save changes" : "Publish article"}
          </Button>
        </>
      }
    >
      <form id="article-form" onSubmit={submit} className="space-y-3.5">
        {error && <p className="rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>}

        <Field label="Name" required>
          <Input
            name="title"
            defaultValue={article?.title}
            placeholder="e.g. Sales pitch — NN Riverview"
            required
            autoFocus
          />
        </Field>

        <div>
          <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Description</p>
          <RichText name="body" defaultValue={article?.body ?? ""} />
          <p className="mt-[5px] text-[10.5px] font-medium text-muted-400">
            Bold, italic, underline, lists, headings and links are supported.
          </p>
        </div>

        <div className="!mt-4">
          <div className="mb-[9px] flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-muted-600">Attachments</p>
            <label className="cursor-pointer rounded-[8px] border border-line-400 bg-white px-3 py-1.5 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-500">
              + Add file
              <input
                type="file"
                name="files"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
              />
            </label>
          </div>
          <label className="block cursor-pointer rounded-[11px] border border-dashed border-muted-200 bg-surface-sunken p-6 text-center transition-colors hover:border-brand-500">
            <span className="block text-[12.5px] font-semibold text-muted-500">
              Drop files here — PDF, DOCX, XLSX, ZIP, images
            </span>
            <span className="mt-1 block text-[11px] font-medium text-muted-400">
              {files.length > 0 ? files.join(" · ") : "Multiple attachments supported per article"}
            </span>
            <input
              type="file"
              name="files"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
          </label>
        </div>
      </form>
    </Drawer>
  );
}
