import "server-only";

import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { getAuthContext, type AuthContext } from "@/lib/rbac/context";
import {
  EXPORT_MIME, exportFileName, isExportFormat, toCsv, toPdf, toXlsx,
  type ExportFormat,
} from "@/lib/reports/export";
import type { ReportResult } from "@/lib/reports/types";

/**
 * The shared half of every list export route: who may export, in what format,
 * and how the file goes back — so each route is only its query.
 *
 *   export async function GET(request: Request) {
 *     const gate = await exportGate(request, PERM.sales.booking.view, PERM.sales.booking.export);
 *     if (!gate.ok) return gate.response;
 *     const rows = await prisma.booking.findMany({ where: sameWhereAsTheScreen(gate.ctx, gate.params) });
 *     return exportResponse({ ...gate, title: "Bookings", entity: "Booking", filters: "…", result: { columns, rows } });
 *   }
 */

/** A ceiling against an accidental unbounded read — not a page size. */
export const EXPORT_MAX_ROWS = 20_000;

export type ExportGate =
  | { ok: true; ctx: AuthContext; format: ExportFormat; params: URLSearchParams }
  | { ok: false; response: NextResponse };

/**
 * Signed in, holding every listed permission, asking for a format we produce —
 * or the response to send instead. Pass the list's view permission *and* its
 * export permission: holding export alone must not reveal a list one cannot see.
 */
export async function exportGate(request: Request, ...codes: string[]): Promise<ExportGate> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, response: new NextResponse("Sign-in required.", { status: 401 }) };
  if (codes.length === 0 || !codes.every((c) => ctx.has(c))) {
    return { ok: false, response: new NextResponse("You do not have permission to export this list.", { status: 403 }) };
  }
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  if (!isExportFormat(format)) {
    return { ok: false, response: new NextResponse("Choose csv, xlsx or pdf.", { status: 400 }) };
  }
  return { ok: true, ctx, format, params };
}

/** Rows capped at EXPORT_MAX_ROWS, with a note for the summary when they were. */
export function capRows<T>(rows: T[]): { rows: T[]; note: string } {
  if (rows.length <= EXPORT_MAX_ROWS) return { rows, note: rows.length.toLocaleString("en-IN") };
  return {
    rows: rows.slice(0, EXPORT_MAX_ROWS),
    note: `${EXPORT_MAX_ROWS.toLocaleString("en-IN")} (first of more — narrow the filters)`,
  };
}

/** Builds the file, records the export, and returns the download. */
export async function exportResponse(opts: {
  ctx: AuthContext;
  format: ExportFormat;
  /** Heading of the file and stem of its name, e.g. "Bookings". */
  title: string;
  /** Audit entity, e.g. "Booking". */
  entity: string;
  /** What the rows were narrowed to, in words. */
  filters: string;
  result: ReportResult;
  projectId?: string | null;
}): Promise<NextResponse> {
  const { ctx, format, title, entity, filters, result } = opts;
  const now = new Date();
  const meta = { title, filters, generatedBy: ctx.name, generatedAt: now };

  let body: Buffer;
  try {
    body = format === "csv"
      ? Buffer.from(toCsv(result), "utf-8")
      : format === "xlsx" ? await toXlsx(result, meta) : await toPdf(result, meta);
  } catch (error) {
    console.error(`[export] ${title} ${format} failed`, error);
    return new NextResponse("The export could not be produced. Try another format.", { status: 500 });
  }

  await recordAudit({
    action: "EXPORT",
    entity,
    userId: ctx.id,
    projectId: opts.projectId ?? null,
    summary: `Exported ${result.rows.length} ${title.toLowerCase()} as ${format.toUpperCase()} (${filters})`,
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": EXPORT_MIME[format],
      "Content-Disposition": `attachment; filename="${exportFileName(title, format, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
