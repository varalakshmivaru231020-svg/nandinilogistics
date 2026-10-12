import "server-only";

import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
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

/**
 * `json` is not an export format — it is the Android client reading the list.
 *
 * Deliberately not added to `ExportFormat`: the web's export menu is built from
 * that type, and a JSON file is not something anybody wants to download. Adding
 * it there would put a fourth item in a menu nobody asked for.
 */
export type ListFormat = ExportFormat | "json";

export type ExportGate =
  | { ok: true; ctx: AuthContext; format: ListFormat; params: URLSearchParams }
  | { ok: false; response: NextResponse };

/**
 * Signed in, holding every listed permission, asking for a format we produce —
 * or the response to send instead. Pass the list's view permission *and* its
 * export permission: holding export alone must not reveal a list one cannot see.
 *
 * `format=json` is the same query read by the Android client, and it is gated
 * differently on purpose: **reading a list is not exporting it**, so the export
 * permission is not required, and `admin.mobile.use` is — it is the app asking.
 * Someone who may see indents but not export them can still see them on a
 * phone, which is what the web already lets them do on screen.
 */
export async function exportGate(request: Request, ...codes: string[]): Promise<ExportGate> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, response: new NextResponse("Sign-in required.", { status: 401 }) };

  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  const asList = format === "json";

  if (!asList && !isExportFormat(format)) {
    return { ok: false, response: new NextResponse("Choose csv, xlsx or pdf.", { status: 400 }) };
  }

  const needed = asList
    ? [...codes.filter((c) => !c.endsWith(".export")), PERM.admin.mobile.use]
    : codes;

  if (needed.length === 0 || !needed.every((c) => ctx.has(c))) {
    const missing = needed.find((c) => !ctx.has(c));
    if (asList) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: missing === PERM.admin.mobile.use
              ? "This account is not allowed to use the mobile app."
              : `You do not have permission to see that list (${missing}).`,
            code: missing,
          },
          { status: 403 },
        ),
      };
    }
    return { ok: false, response: new NextResponse("You do not have permission to export this list.", { status: 403 }) };
  }

  return { ok: true, ctx, format: asList ? "json" : (format as ExportFormat), params };
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
  format: ListFormat;
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

  /*
   * The list, as the app reads it: the same rows, the same columns and the same
   * filter description the file would have carried. No audit row — a list read
   * is not an export, and one row per scroll would drown the trail that
   * actually matters.
   */
  if (format === "json") {
    return NextResponse.json(
      {
        ok: true,
        data: {
          title,
          filters,
          columns: result.columns,
          rows: result.rows,
          summary: result.summary ?? [],
          total: result.rows.length,
          emptyMessage: result.emptyMessage ?? null,
          serverTime: now.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
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
