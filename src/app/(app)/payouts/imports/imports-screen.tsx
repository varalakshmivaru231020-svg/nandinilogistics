"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ModuleStats } from "@/components/list/module-stats";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  IMPORT_EMPTY, IMPORT_STATUS_LABEL, IMPORT_STATUS_TONE, importBandFigures, type ImportFigures,
} from "@/lib/payouts/list-display";
import { formatDate, formatDateTime, money } from "@/lib/utils";
import { deletePayoutImportAction, postPayoutImportAction } from "../actions";
import { FilterBar, Pill, Td, Th } from "../_shared/filter-bar";

interface Row {
  id: string;
  fileName: string;
  status: string;
  company: string;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  uploadedBy: string;
  lines: number;
  unmatched: number;
  total: number;
}

export function ImportsScreen({
  imports, summary, companies, picked, q, can,
}: {
  imports: Row[];
  summary: ImportFigures;
  companies: Array<{ id: string; name: string }>;
  picked: { company: string; status: string };
  q: string;
  can: { create: boolean; post: boolean; delete: boolean; export: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Row | null>(null);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Payout sheets"
        description="One Excel sheet per company per period. Review the draft, match any Rider ID the sheet got wrong, then post it."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/payouts" className="hover:text-brand-600">Payouts</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Sheets</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {can.export && <ExportMenu href={(f) => exportHref("/api/payouts/imports/export", f, query)} />}
            {can.create && (
              <Link href="/payouts/imports/new">
                <Button size="sm">+ Import a sheet</Button>
              </Link>
            )}
          </div>
        }
      />

      <ModuleStats figures={importBandFigures(summary)} />

      <FilterBar
        basePath="/payouts/imports"
        q={q}
        searchPlaceholder="Search file or company…"
        filters={[
          { name: "company", label: "Company", value: picked.company, allLabel: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
          { name: "status", label: "Status", value: picked.status, allLabel: "Drafts and posted", options: [{ value: "DRAFT", label: "Draft" }, { value: "POSTED", label: "Posted" }] },
        ]}
      />

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              <Th>Company · period</Th>
              <Th>File</Th>
              <Th className="text-right">Rows</Th>
              <Th className="text-right">Final payout</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {imports.map((i) => (
              <tr key={i.id} className="hover:bg-surface-tint">
                <Td>
                  <Link href={`/payouts/imports/${i.id}`} className="block">
                    <span className="text-[13px] font-semibold text-navy-800 hover:text-brand-700">{i.company}</span>
                    <span className="block text-[11px] font-medium text-muted-400">{formatDate(i.periodFrom)} – {formatDate(i.periodTo)}</span>
                  </Link>
                </Td>
                <Td>
                  <span className="block text-[12px] font-medium text-navy-700">{i.fileName}</span>
                  <span className="block text-[11px] font-medium text-muted-400">{i.uploadedBy} · {formatDateTime(i.createdAt)}</span>
                </Td>
                <Td className="num text-right text-[12.5px] font-semibold text-navy-800">
                  {i.lines}
                  {i.unmatched > 0 && <span className="ml-1.5 rounded-full bg-bad-050 px-1.5 py-0.5 text-[9.5px] font-bold text-bad-700">{i.unmatched} unmatched</span>}
                </Td>
                <Td className="num text-right text-[13px] font-bold text-navy-950">{money(i.total)}</Td>
                <Td><Pill tone={IMPORT_STATUS_TONE[i.status] ?? "draft"}>{IMPORT_STATUS_LABEL[i.status] ?? i.status}</Pill></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {i.status === "DRAFT" && can.post && (
                      <button
                        type="button"
                        disabled={busy || i.unmatched > 0}
                        title={i.unmatched > 0 ? "Match every row first" : undefined}
                        onClick={() => run(() => postPayoutImportAction(i.id), "Payout posted.")}
                        className="cursor-pointer rounded-[7px] bg-brand-500 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Post
                      </button>
                    )}
                    {i.status === "DRAFT" && can.delete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleting(i)}
                        className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB] disabled:opacity-60"
                      >
                        Delete
                      </button>
                    )}
                    <Link href={`/payouts/imports/${i.id}`} className="rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-muted-600 transition-colors hover:border-brand-500 hover:text-brand-700">
                      Open
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
            {imports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">{IMPORT_EMPTY.title}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deletePayoutImportAction(deleting.id), "Sheet deleted.")}
        title="Delete this draft sheet?"
        message={deleting ? `${deleting.fileName} and its ${deleting.lines} rows are removed. Nothing has been posted from it.` : ""}
        loading={busy}
      />
    </div>
  );
}
