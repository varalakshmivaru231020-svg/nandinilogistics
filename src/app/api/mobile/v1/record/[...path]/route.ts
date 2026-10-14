import { FORMS } from "@/lib/forms/registry";
import { RECORDS } from "@/lib/records/registry";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * One whole record, with its children and what may be done to it.
 *
 *   GET /api/mobile/v1/record/tasks/<id>
 *   GET /api/mobile/v1/record/material/indents/<id>
 *
 * The client had nothing like this: a detail screen was built from the row the
 * list gave it, so a task had no checklist and an indent had no lines, and
 * there was nothing to press. The actions come back with the record because
 * whether a task may be started depends on the task, not on the module — and
 * the lifecycle that decides it lives here.
 *
 * A record the viewer may not see answers **404, not 403**, wherever the web
 * does: confirming that a task exists to somebody not on it is itself a leak.
 */
export const GET = mobileRoute([], async (req, actor) => {
  const rest = new URL(req.url).pathname.split("/record/")[1]?.replace(/\/$/, "") ?? "";
  // The module key may itself contain a slash — "material/indents/<id>".
  const match = Object.keys(RECORDS)
    .filter((k) => rest.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];

  if (!match) {
    return apiFail(
      404,
      `There is no record screen for that yet: ${rest.split("/").slice(0, -1).join("/") || rest}`,
      "unknown-record",
    );
  }

  const def = RECORDS[match];
  if (!actor.has(def.permission)) {
    return apiFail(403, `You do not have permission to see that (${def.permission}).`, def.permission);
  }

  const id = rest.slice(match.length + 1);
  if (!id) return apiFail(404, "No record id given.", "unknown-record");

  const view = await def.load(actor, id);
  if (!view) return apiFail(404, "That record is not there, or is not yours to see.", "not-found");

  /*
   * An action that opens a form is only offered where that form exists and
   * this viewer may open it. A record names the form it wants; whether it is
   * described yet is the form registry's business, and a button that leads to
   * "not on the phone yet" is worse than no button.
   */
  const offered = view.actions.filter((a) => {
    if (!a.form) return true;
    const form = FORMS[a.form];
    return Boolean(form) && actor.has(form.permission);
  });

  return apiOk(offered.length === view.actions.length ? view : { ...view, actions: offered });
});
