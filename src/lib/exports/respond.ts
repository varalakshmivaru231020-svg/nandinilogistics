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
import type { ScreenShell } from "@/lib/screens/rows";

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
 * How many rows a page of a list carries, when the caller asks for one.
 *
 * The web paginates three of its lists — indents and purchase orders thirty
 * to a page, units fifty — and reads the rest whole. A phone cannot read
 * twenty thousand rows over a site connection, so the JSON mode takes `page`
 * and `pageSize` and the client walks them. Without `page` nothing changes:
 * the whole list comes back, as it did for every caller before this.
 */
export const LIST_PAGE_SIZE = 50;
export const LIST_PAGE_MAX = 200;

/**
 * `json` is not an export format — it is the Android client reading the list.
 *
 * Deliberately not added to `ExportFormat`: the web's export menu is built from
 * that type, and a JSON file is not something anybody wants to download. Adding
 * it there would put a fourth item in a menu nobody asked for.
 */
export type ListFormat = ExportFormat | "json";

/**
 * Which rows will actually travel, so a route can compose **only those**.
 *
 * A list answers every matching row and the page is taken at the end, which is
 * fine for a flat table and not fine for a composed one: an indent's row needs
 * live stock and what has been issued against it, and reading that for twenty
 * thousand indents to send fifty of them would be absurd. So a route asks for
 * the window first, builds the screen for it, and `exportResponse` sends it
 * beside the same slice of plain rows.
 */
export function listWindow(
  params: URLSearchParams | undefined,
  total: number,
): { page: number | null; pageSize: number; from: number; to: number } {
  const asked = Number(params?.get("page") ?? 0);
  const page = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : null;
  const sizeAsked = Number(params?.get("pageSize") ?? 0);
  const pageSize = Math.min(
    LIST_PAGE_MAX,
    Number.isFinite(sizeAsked) && sizeAsked >= 1 ? Math.floor(sizeAsked) : LIST_PAGE_SIZE,
  );
  const from = page === null ? 0 : Math.min(total, (page - 1) * pageSize);
  const to = page === null ? total : Math.min(total, page * pageSize);
  return { page, pageSize, from, to };
}

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
export async function exportGate(
  request: Request,
  ...rest: Array<string | { asList: string[] }>
): Promise<ExportGate> {
  /*
   * A screen whose **list** is gated differently from its file says so with a
   * trailing `{ asList }`.
   *
   * Available Flats is the one: the web's board asks `unit.board.view`, while
   * the flats export asks the unit master's own view. Hanging the board off
   * this route gave a Project Manager — who may see the board and not the
   * master — nothing at all on the phone, where the web shows them the board.
   */
  const last = rest[rest.length - 1];
  const override = typeof last === "object" ? last.asList : null;
  const codes = rest.filter((c): c is string => typeof c === "string");
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, response: new NextResponse("Sign-in required.", { status: 401 }) };

  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  const asList = format === "json";

  if (!asList && !isExportFormat(format)) {
    return { ok: false, response: new NextResponse("Choose csv, xlsx or pdf.", { status: 400 }) };
  }

  const needed = asList
    ? [...(override ?? codes.filter((c) => !c.endsWith(".export"))), PERM.admin.mobile.use]
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
  /** The request's own query, for the page the client asked for. */
  params?: URLSearchParams;
  /**
   * The screen, composed as the web composes it — its rows, its band, its
   * empty state and its note. Read by the app and by nothing else: a file is a
   * table of columns, and none of this is a column.
   */
  screen?: ScreenShell;
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
    /*
     * A page of it, where one was asked for. The filters and the scope have
     * already decided which rows these are — this only decides how many of
     * them travel at once — so a page cannot show something the whole list
     * would not have.
     */
    const total = result.rows.length;
    const { page, pageSize, from, to } = listWindow(opts.params, total);
    const rows = result.rows.slice(from, to);

    /*
     * The composed rows are the window's own, built by the route for exactly
     * these records. If they ever stop lining up, the row would wear another
     * row's badge — so the block is dropped rather than sent wrong, and the
     * client falls back to the columns.
     */
    let screen = opts.screen ?? null;
    if (screen && screen.rows.length !== rows.length) {
      console.error(
        `[list] ${title}: ${screen.rows.length} composed rows for ${rows.length} rows — dropping the screen block`,
      );
      screen = null;
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          title,
          filters,
          columns: result.columns,
          rows,
          summary: result.summary ?? [],
          total,
          // What the client needs to walk the list, and nothing when it asked
          // for the lot.
          ...(page === null
            ? {}
            : { page, pageSize, hasMore: page * pageSize < total }),
          emptyMessage: result.emptyMessage ?? null,
          ...(screen ? { screen } : {}),
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
