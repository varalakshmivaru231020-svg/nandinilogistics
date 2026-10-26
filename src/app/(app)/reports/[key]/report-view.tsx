"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Filter, Search, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, Card, CardBody, EmptyState, Input, Select } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
import {
  filterQueryString, hasFilters, type ReportFilterSpec, type ReportFilters,
} from "@/lib/reports/filters";
import type { ReportColumn } from "@/lib/reports/types";

type Row = Record<string, unknown>;

function render(value: unknown, format?: string): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-400">—</span>;
  }
  switch (format) {
    case "money": return money(value);
    case "qty": return qty(value, 3);
    case "number": return Number(value).toLocaleString("en-IN");
    case "percent": return `${Number(value)}%`;
    case "date": return formatDate(value as string);
    case "badge": {
      const text = String(value);
      const tone =
        /DELAYED|MISMATCH|CANCELLED|Yes|Over a week/i.test(text) ? "bad"
          : /COMPLETED|PAID|RECEIVED|REGISTERED|Under 4/i.test(text) ? "good"
          : /PROGRESS|PARTIAL|4–7/i.test(text) ? "warn"
          : "slate";
      return <Badge tone={tone as "bad" | "good" | "warn" | "slate"}>{text}</Badge>;
    }
    default: return String(value);
  }
}

/**
 * The company and date filters live in the URL and are applied on the server,
 * so the export route — which reads the same URL — produces exactly these
 * rows. The search box only narrows what is already on screen.
 */
function FilterBar({
  spec, filters, companies,
}: {
  spec: ReportFilterSpec;
  filters: ReportFilters;
  companies: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  function apply(next: ReportFilters) {
    const qs = filterQueryString(next);
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "") || undefined;
    apply({ companyId: value("company"), from: value("from"), to: value("to") });
  }

  if (!spec.company && !spec.date) return null;

  return (
    <Card>
      <CardBody className="py-3">
        {/* Keyed on the applied filters so the inputs reset when the URL changes. */}
        <form key={filterQueryString(filters)} onSubmit={submit} className="flex flex-wrap items-end gap-3">
          {spec.company && (
            <label className="grid gap-1 text-xs text-muted-500">
              Company
              <Select name="company" defaultValue={filters.companyId ?? ""} className="min-w-52">
                <option value="">All accessible companies</option>
                {companies.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </label>
          )}
          {spec.date && (
            <>
              <label className="grid gap-1 text-xs text-muted-500">
                From <span className="sr-only">({spec.date})</span>
                <Input type="date" name="from" defaultValue={filters.from ?? ""} />
              </label>
              <label className="grid gap-1 text-xs text-muted-500">
                To
                <Input type="date" name="to" defaultValue={filters.to ?? ""} />
              </label>
            </>
          )}
          <Button type="submit" size="sm" loading={pending}>
            <Filter className="h-3.5 w-3.5" />
            Apply
          </Button>
          {hasFilters(filters) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => apply({})} disabled={pending}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          {spec.date && <p className="basis-full text-xs text-muted-400 sm:basis-auto">Dates are by {spec.date.toLowerCase()}.</p>}
        </form>
      </CardBody>
    </Card>
  );
}

export function ReportView({
  reportKey, columns, rows, summary, emptyMessage, canExport, spec, filters, companies,
}: {
  reportKey: string;
  columns: ReportColumn[];
  rows: Row[];
  summary?: Array<{ label: string; value: string; tone?: string }>;
  emptyMessage?: string;
  canExport: boolean;
  spec: ReportFilterSpec;
  filters: ReportFilters;
  companies: Array<{ id: string; label: string }>;
}) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const exportHref = (format: "csv" | "xlsx" | "pdf") => {
    const qs = filterQueryString(filters);
    return `/api/reports/${reportKey}/export?format=${format}${qs ? `&${qs}` : ""}`;
  };

  const tableColumns: Column<Row>[] = columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    className: ["money", "number", "qty", "percent"].includes(c.format ?? "") ? "num" : undefined,
    render: (row) => render(row[c.key], c.format),
  }));

  const toneClass: Record<string, string> = {
    good: "text-good-700",
    warn: "text-warn-700",
    bad: "text-bad-600",
    default: "text-navy-950",
  };

  const exportClass = cn(
    buttonVariants({ variant: "secondary", size: "sm" }),
    rows.length === 0 && "pointer-events-none opacity-50",
  );

  return (
    <div className="space-y-3">
      <FilterBar spec={spec} filters={filters} companies={companies} />

      {summary && summary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {summary.map((s) => (
            <Card key={s.label}>
              <CardBody className="py-3">
                <p className="text-xs text-muted-500">{s.label}</p>
                <p className={cn("num mt-0.5 text-xl font-semibold", toneClass[s.tone ?? "default"])}>
                  {s.value}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search these rows…" className="pl-8" />
        </div>
        <Badge tone="slate">{filtered.length} row(s)</Badge>
        <div className="flex-1" />
        {canExport && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Export">
            {/* Exports carry the applied filters; the search box above is on-screen only. */}
            <a href={exportHref("xlsx")} className={exportClass} aria-disabled={rows.length === 0}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </a>
            <a href={exportHref("pdf")} className={exportClass} aria-disabled={rows.length === 0}>
              <FileText className="h-3.5 w-3.5" />
              PDF
            </a>
            <a href={exportHref("csv")} className={exportClass} aria-disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="Nothing to report" description={emptyMessage ?? "There is no data for this report yet."} />
        </Card>
      ) : (
        <DataTable
          columns={tableColumns}
          rows={filtered}
          rowKey={(_, i) => String(i)}
          dense
          empty={<EmptyState title="No rows match your search" />}
        />
      )}
    </div>
  );
}
