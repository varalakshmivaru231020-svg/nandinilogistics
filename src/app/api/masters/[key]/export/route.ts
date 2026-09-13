import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getMaster, masterPerm } from "@/lib/masters/registry";
import { defaultOrderBy, delegate, searchFilter } from "@/lib/masters/service";
import { getAuthContext } from "@/lib/rbac/context";
import {
  EXPORT_MIME, exportFileName, isExportFormat, toCsv, toPdf, toXlsx,
} from "@/lib/reports/export";
import type { ReportColumn, ReportResult } from "@/lib/reports/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/** Enough for any master; a guard against an accidental unbounded read, not a page size. */
const MAX_ROWS = 20_000;

/**
 * Exports a master list — every row matching the screen's search and status
 * filter, not just the page on display.
 *
 * The columns are the form's fields under their form labels, plus Status: the
 * same headers the import reads, so an export can be edited and imported back.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getMaster(key);
  if (!def) return new NextResponse("Master not found.", { status: 404 });

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(masterPerm(def, "view")) || !ctx.has(masterPerm(def, "export"))) {
    return new NextResponse(`You do not have permission to export ${def.label.toLowerCase()}.`, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!isExportFormat(format)) return new NextResponse("Choose csv, xlsx or pdf.", { status: 400 });

  const q = url.searchParams.get("q") ?? "";
  const status = url.searchParams.get("status");
  const where = {
    ...searchFilter(def, q),
    ...(status === "active" ? { status: "ACTIVE" } : status === "inactive" ? { status: "INACTIVE" } : {}),
  };

  const records: Array<Record<string, unknown>> = await delegate(def).findMany({
    where,
    orderBy: defaultOrderBy(def),
    take: MAX_ROWS + 1,
  });
  const truncated = records.length > MAX_ROWS;
  const rowsIn = truncated ? records.slice(0, MAX_ROWS) : records;

  // Labels for every select, inactive entries included: a record that points at
  // a since-deactivated city still names that city in its export.
  const labels: Record<string, Map<string, string>> = {};
  for (const f of def.fields) {
    if (f.type !== "select") continue;
    if (f.options) {
      labels[f.name] = new Map(f.options.map((o) => [o.value, o.label]));
      continue;
    }
    if (!f.optionsFrom) continue;
    const ids = [...new Set(rowsIn.map((r) => r[f.name]).filter((v): v is string => typeof v === "string"))];
    if (ids.length === 0) { labels[f.name] = new Map(); continue; }
    const src = f.optionsFrom;
    const found: Array<Record<string, unknown>> = await (prisma as any)[src.model].findMany({
      where: { id: { in: ids } },
      select: { id: true, [src.labelField]: true },
    });
    labels[f.name] = new Map(found.map((o) => [String(o.id), String(o[src.labelField] ?? o.id)]));
  }

  const columns: ReportColumn[] = [
    ...def.fields.map<ReportColumn>((f) => ({
      key: f.name,
      header: f.label,
      align: f.type === "number" || f.type === "decimal" ? "right" : undefined,
      format: f.type === "decimal" ? "qty" : f.type === "number" ? "number" : "text",
    })),
    { key: "status", header: "Status" },
  ];

  const rows = rowsIn.map((r) => {
    const out: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = r[f.name];
      if (f.type === "select") out[f.name] = typeof v === "string" ? (labels[f.name]?.get(v) ?? "") : "";
      else if (f.type === "checkbox") out[f.name] = v ? "Yes" : "No";
      else if (f.type === "number" || f.type === "decimal") out[f.name] = v === null || v === undefined ? null : Number(v);
      else out[f.name] = v ?? "";
    }
    out.status = r.status === "INACTIVE" ? "Inactive" : "Active";
    return out;
  });

  const result: ReportResult = {
    columns,
    rows,
    summary: [
      { label: "Records", value: rows.length.toLocaleString("en-IN") + (truncated ? ` (first ${MAX_ROWS.toLocaleString("en-IN")})` : "") },
    ],
    emptyMessage: `No ${def.label.toLowerCase()} match.`,
  };

  const filterWords = [
    q.trim() ? `Search "${q.trim()}"` : null,
    status === "active" ? "Active only" : status === "inactive" ? "Inactive only" : null,
  ].filter(Boolean).join(" · ") || "All records";

  const now = new Date();
  const meta = { title: def.label, filters: filterWords, generatedBy: ctx.name, generatedAt: now };

  let body: Buffer;
  try {
    body = format === "csv"
      ? Buffer.from(toCsv(result), "utf-8")
      : format === "xlsx" ? await toXlsx(result, meta) : await toPdf(result, meta);
  } catch (error) {
    console.error(`[masters] ${def.key} ${format} export failed`, error);
    return new NextResponse("The export could not be produced. Try another format.", { status: 500 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: def.singular,
    userId: ctx.id,
    summary: `Exported ${rows.length} ${def.label.toLowerCase()} as ${format.toUpperCase()} (${filterWords})`,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": EXPORT_MIME[format],
      "Content-Disposition": `attachment; filename="${exportFileName(def.label, format, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
