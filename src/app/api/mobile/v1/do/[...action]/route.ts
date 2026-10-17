import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";
import { buildArgs } from "@/lib/api/mobile-args";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * Every server action the app may call, at one endpoint.
 *
 *   POST /api/mobile/v1/do/tasks/acceptTask        { "args": ["<id>"] }
 *   POST /api/mobile/v1/do/material/indents/approveIndent
 *        { "args": ["<id>", "PM", "Approved", [{ "itemId": "…", "approvedQty": 8 }]] }
 *
 * The action is run as written. It calls `authorize()` with its own permission,
 * makes its own state checks, writes its own audit row and answers in the
 * `{ ok, … }` envelope — so the whole model the web enforces applies here
 * without being restated, and cannot drift from it.
 *
 * What this adds is the device check (`admin.mobile.use`, in `mobileRoute`) and
 * the argument coercion below. Nothing else: an action that refuses a
 * supervisor on the web refuses them here, for the same reason, in the same
 * words.
 */

export const POST = mobileRoute([], async (req) => {
  const url = new URL(req.url);
  /*
   * Decoded, because an action's key is a route folder and one of them is
   * `[id]` — `projects/[id]/documents/uploadDocument`. A bracket is not legal
   * in a path, so a client sends it as `%5Bid%5D`, and the raw pathname then
   * matches nothing: every one of those three actions answered "No such
   * action" from the app.
   */
  const raw = url.pathname.split("/api/mobile/v1/do/")[1] ?? "";
  let key = raw;
  try {
    key = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a key either; it falls through to the 404.
  }
  const def = MOBILE_ACTIONS[key];

  /*
   * 404, not 403. There is no such action — saying "you are not allowed" would
   * tell a caller that a typo is a permission problem, and send them to an
   * administrator instead of to the action list above.
   */
  if (!def) return apiFail(404, `No such action: ${key}`, "unknown-action");

  let args: unknown[];
  let attached: FormData | null = null;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const json = form.get("args");
      form.delete("args");
      attached = form;
      args = buildArgs(def, json ? JSON.parse(String(json)) : [], attached);
    } else {
      const body = (await req.json().catch(() => ({}))) as { args?: unknown };
      args = buildArgs(def, body.args, null);
    }
  } catch (err) {
    return apiFail(422, err instanceof Error ? err.message : "Those arguments are not usable.");
  }

  // The action's own result is already the envelope. It is returned as-is:
  // rewrapping it would mean two places deciding what a failure reads like.
  const result = (await def.fn(...(args as never[]))) as
    | { ok: true; data?: unknown }
    | { ok: false; error: string; code?: string };

  if (result && typeof result === "object" && result.ok === false) {
    return Response.json(result, { status: result.code ? 403 : 400 });
  }
  return apiOk((result as { data?: unknown })?.data ?? null);
});
