import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { getReport, runReport } from "@/lib/reports";
import {
  EXPORT_MIME, exportFileName, isExportFormat, toCsv, toPdf, toXlsx,
} from "@/lib/reports/export";
import { describeFilters, filterSpecFor, parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

/**
 * Downloads a report as CSV, Excel or PDF.
 *
 * Guarded like the page and then some: the caller needs the report's view
 * permission *and* its export permission. The rows come from the same
 * runReport, with the same filters parsed the same way, so the file holds
 * exactly what the screen showed — never more.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) return new NextResponse("Report not found.", { status: 404 });

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(`reports.${def.key}.view`) || !ctx.has(`reports.${def.key}.export`)) {
    return new NextResponse("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!isExportFormat(format)) {
    return new NextResponse("Choose csv, xlsx or pdf.", { status: 400 });
  }

  const filters = parseReportFilters(url.searchParams, filterSpecFor(def.key));
  const result = await runReport(def.key, ctx, filters);

  let companyLabel: string | null = null;
  if (filters.companyId) {
    const company = await prisma.company.findUnique({ where: { id: filters.companyId }, select: { name: true } });
    companyLabel = company?.name ?? "Unknown company";
  }

  const now = new Date();
  const meta = {
    title: def.label,
    filters: describeFilters(filters, companyLabel),
    generatedBy: ctx.name,
    generatedAt: now,
  };

  let body: Buffer;
  try {
    body = format === "csv"
      ? Buffer.from(toCsv(result), "utf-8")
      : format === "xlsx"
        ? await toXlsx(result, meta)
        : await toPdf(result, meta);
  } catch (error) {
    console.error(`[reports] ${def.key} ${format} export failed`, error);
    return new NextResponse("The export could not be produced. Try another format.", { status: 500 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: "Report",
    entityId: def.key,
    summary: `Exported ${def.label} as ${format.toUpperCase()} — ${result.rows.length} rows (${meta.filters})`,
    userId: ctx.id,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": EXPORT_MIME[format],
      "Content-Disposition": `attachment; filename="${exportFileName(def.label, format, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
