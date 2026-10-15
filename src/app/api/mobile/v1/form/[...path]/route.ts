import { resolveForm } from "@/lib/forms/resolve";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * One form, as the web draws it.
 *
 *   GET /api/mobile/v1/form/calendar/create
 *   GET /api/mobile/v1/form/sales/customers/create
 *   GET /api/mobile/v1/form/sales/leads/edit?id=<lead>
 *
 * The last segment names the form; everything before it is the module. The
 * client renders the fields it is given rather than carrying its own copy of
 * them, so a field added to a web modal reaches the phone without a rebuild —
 * and submitting calls the same server action the web calls, which authorizes
 * again on the way in.
 */
export const GET = mobileRoute([], async (req, actor) => {
  const url = new URL(req.url);
  const path = url.pathname.split("/form/")[1]?.replace(/\/$/, "") ?? "";
  const cut = path.lastIndexOf("/");
  if (cut <= 0) return apiFail(404, `No such form: ${path}`, "unknown-form");

  const key = `${path.slice(0, cut)}:${path.slice(cut + 1)}`;
  // An edit form is opened on a record and starts as that record stands.
  const form = await resolveForm(actor, key, url.searchParams.get("id"));

  if (form === "unknown-form") {
    return apiFail(404, `There is no form for that yet: ${path}`, "unknown-form");
  }
  if (form === "forbidden") {
    return apiFail(403, "You do not have permission to open this form.", "forbidden");
  }
  if (form === "no-record") {
    return apiFail(404, "That record is not there, or is not yours to see.", "not-found");
  }
  if (typeof form === "object" && "refused" in form) {
    // The record's own rule, in its own words — the same sentence the action
    // would answer with if it were called anyway.
    return apiFail(403, form.refused, "forbidden");
  }
  return apiOk(form);
});
