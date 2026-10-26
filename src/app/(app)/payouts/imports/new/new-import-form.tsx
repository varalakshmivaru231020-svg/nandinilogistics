"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, money } from "@/lib/utils";
import { createPayoutImportAction, previewPayoutImportAction, type ImportPreview } from "../../actions";
import { Td, Th } from "../../_shared/filter-bar";

interface CompanyOption {
  id: string;
  name: string;
  cycle: "WEEKLY" | "MONTHLY";
  mapped: boolean;
  columns: string[];
  period: { from: string; to: string };
}

/**
 * Two steps on one form: the file is read and shown back as a plan — matched,
 * unmatched, invalid — and only then saved as a draft. The same FormData is
 * posted both times, so what was previewed is what is saved.
 */
export function NewImportForm({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [companyId, setCompanyId] = React.useState(companies[0]?.id ?? "");
  const [from, setFrom] = React.useState(companies[0]?.period.from ?? "");
  const [to, setTo] = React.useState(companies[0]?.period.to ?? "");
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "save" | null>(null);

  const company = companies.find((c) => c.id === companyId);

  function pickCompany(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    if (c) { setFrom(c.period.from); setTo(c.period.to); }
    setPreview(null);
  }

  async function doPreview() {
    if (!formRef.current) return;
    setBusy("preview");
    setError(null);
    const res = await previewPayoutImportAction(new FormData(formRef.current));
    setBusy(null);
    if (!res.ok) { setError(res.error); setPreview(null); return; }
    setPreview(res.data);
  }

  async function doSave() {
    if (!formRef.current) return;
    setBusy("save");
    setError(null);
    const res = await createPayoutImportAction(new FormData(formRef.current));
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    toast(`Sheet imported — ${res.data.lines} rows. Review and post it.`);
    router.push(`/payouts/imports/${res.data.id}`);
  }

  const usable = preview ? preview.lines.filter((l) => l.errors.length === 0).length : 0;

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void doPreview(); }} className="space-y-3.5">
      <div className="rounded-[13px] border border-line-400 bg-white px-5 py-4">
        {error && <Alert tone="error" title="The sheet could not be read">{error}</Alert>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Company" required hint={company ? (company.mapped ? `${company.cycle === "WEEKLY" ? "Weekly" : "Monthly"} sheet · columns: ${company.columns.join(", ")}` : "No column mapping yet — set it on the company first.") : undefined}>
            <Select name="companyId" value={companyId} onChange={(e) => pickCompany(e.target.value)} required>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Sheet (.xlsx or .csv)" required>
            <Input name="file" type="file" accept=".xlsx,.csv" required onChange={() => setPreview(null)} />
          </Field>
          <Field label="Period from" required>
            <Input name="periodFrom" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} required />
          </Field>
          <Field label="Period to" required>
            <Input name="periodTo" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} required />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="submit" variant="secondary" loading={busy === "preview"} disabled={!company?.mapped}>
            Read the sheet
          </Button>
          <Button type="button" onClick={doSave} loading={busy === "save"} disabled={!preview || usable === 0 || preview.missing.length > 0}>
            Save as draft
          </Button>
        </div>
      </div>

      {preview && (
        <div className="rounded-[13px] border border-line-400 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-line-200 px-5 py-3">
            <span className="text-[13px] font-bold text-navy-950">{preview.company}</span>
            <span className="rounded-full bg-good-050 px-2.5 py-1 text-[10.5px] font-bold text-good-700">{preview.matched} matched</span>
            {preview.unmatched > 0 && <span className="rounded-full bg-warn-050 px-2.5 py-1 text-[10.5px] font-bold text-warn-800">{preview.unmatched} unmatched — fix after saving</span>}
            {preview.invalid > 0 && <span className="rounded-full bg-bad-050 px-2.5 py-1 text-[10.5px] font-bold text-bad-700">{preview.invalid} with errors — not imported</span>}
            {preview.ignored.length > 0 && <span className="text-[11px] font-medium text-muted-400">Ignored columns: {preview.ignored.join(", ")}</span>}
          </div>
          {preview.missing.length > 0 && (
            <div className="px-5 py-3"><Alert tone="error" title="Columns missing">The sheet has no {preview.missing.join(", ")} column.</Alert></div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr><Th>Row</Th><Th>Rider ID</Th><Th>Matched to</Th><Th className="text-right">Total</Th><Th className="text-right">Advance</Th><Th className="text-right">Bike</Th><Th className="text-right">TDS</Th><Th className="text-right">Sheet final</Th></tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.row} className={cn(l.errors.length > 0 && "bg-bad-025", !l.employeeName && l.errors.length === 0 && "bg-warn-050")}>
                    <Td className="num text-[11.5px] text-muted-500">{l.row}</Td>
                    <Td className="num text-[12.5px] font-semibold text-navy-800">{l.riderCode || "—"}</Td>
                    <Td className="text-[12px]">
                      {l.employeeName ?? <span className="font-semibold text-warn-800">Not matched</span>}
                      {l.errors.length > 0 && <span className="block text-[11px] font-medium text-bad-700">{l.errors.join(" · ")}</span>}
                    </Td>
                    <Td className="num text-right text-[12px]">{money(l.totalPayout)}</Td>
                    <Td className="num text-right text-[12px] text-muted-600">{l.advance === null ? "—" : money(l.advance)}</Td>
                    <Td className="num text-right text-[12px] text-muted-600">{l.bikeRental === null ? "—" : money(l.bikeRental)}</Td>
                    <Td className="num text-right text-[12px] text-muted-600">{l.tds === null ? "—" : money(l.tds)}</Td>
                    <Td className="num text-right text-[12px] font-semibold">{l.finalPayout === null ? "—" : money(l.finalPayout)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11.5px] font-medium text-muted-400">
            A dash means the sheet carried no figure; the system fills it from approved advances and bike rent when the sheet is posted.
          </p>
        </div>
      )}
    </form>
  );
}
