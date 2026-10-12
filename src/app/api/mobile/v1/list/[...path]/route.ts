import { MOBILE_LISTS } from "@/lib/api/mobile-lists";
import { apiFail, mobileRoute } from "@/lib/api/mobile";

/**
 * Any list the app shows.
 *
 *   GET /api/mobile/v1/list/material/indents?status=DRAFT&q=cement
 *
 * It hands the request to that list's export route with `format=json` forced,
 * which is the screen's own query — same filters, same project scope, same rule
 * hiding other people's records. The query string is the one the web reads from
 * the URL, so the app's filter sheet and the web's toolbar take the same
 * parameters (brief §7.24).
 *
 * `format` is forced rather than passed through, so this path cannot be asked
 * for a PDF. A file is a download and belongs to the export routes, which check
 * the export permission; this one does not, because reading a list is not
 * exporting it.
 */
export const GET = mobileRoute([], async (req) => {
  const url = new URL(req.url);
  const key = url.pathname.split("/api/mobile/v1/list/")[1]?.replace(/\/$/, "") ?? "";
  const handler = MOBILE_LISTS[key];

  // 404, not 403: there is no such list. Telling a caller they lack permission
  // would send a typo to an administrator instead of to the catalogue.
  if (!handler) return apiFail(404, `No such list: ${key}`, "unknown-list");

  const forwarded = new URL(url);
  forwarded.pathname = `/api/${key}/export`;
  forwarded.searchParams.set("format", "json");

  /*
   * The headers come across whole, because the list's own guard resolves the
   * actor from them — the bearer token and `X-Project` both matter, and a
   * request rebuilt without them would be a request from nobody.
   */
  return handler(new Request(forwarded, { headers: req.headers }));
});
