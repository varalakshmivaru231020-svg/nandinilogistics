"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, Card, CardBody, EmptyState, Input } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
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

export function ReportView({
  title, columns, rows, summary, emptyMessage, canExport,
}: {
  title: string;
  columns: ReportColumn[];
  rows: Row[];
  summary?: Array<{ label: string; value: string; tone?: string }>;
  emptyMessage?: string;
  canExport: boolean;
}) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(term)),
    );
  }, [rows, search]);

  function exportCsv() {
    const header = columns.map((c) => c.header);
    const lines = filtered.map((r) =>
      columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return "";
        if (c.format === "date") return formatDate(v as string);
        return String(v);
      }),
    );
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  return (
    <div className="space-y-3">
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter rows…" className="pl-8" />
        </div>
        <Badge tone="slate">{filtered.length} row(s)</Badge>
        <div className="flex-1" />
        {canExport && (
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
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
          empty={<EmptyState title="No rows match your filter" />}
        />
      )}
    </div>
  );
}
