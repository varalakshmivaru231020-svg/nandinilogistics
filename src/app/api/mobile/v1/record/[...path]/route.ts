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
  return apiOk(view);
});
