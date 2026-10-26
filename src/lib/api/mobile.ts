import "server-only";

import { ZodError } from "zod";

import { bearerToken } from "@/lib/auth/session";
import { PERM } from "@/lib/permissions/codes";
import { getAuthContextFromToken, type AuthContext } from "@/lib/rbac/context";
import { AuthRequiredError, PermissionError } from "@/lib/rbac/guard";

/**
 * The boundary the Android app talks to.
 *
 * The web app has no public API: a screen is a server component and a button is
 * a server action, and neither is reachable from a phone. So the app gets its
 * own transport — and the rule that makes it safe is that the transport carries
 * no authority of its own. Every handler names the same permission codes the
 * equivalent web page and server action name, and they are re-checked here on
 * every request. Nothing is trusted because the app drew it.
 *
 * On top of its own codes, every endpoint needs `admin.mobile.use`. That is the
 * one permission that exists because the phone exists: it lets an administrator
 * stop a role signing in from a device without changing what they may do at a
 * desk.
 */

/** Every response the app ever parses is one of these two shapes. */
export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function apiOk<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data } satisfies ApiEnvelope<T>, { status });
}

export function apiFail(
  status: number,
  error: string,
  code?: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return Response.json(
    { ok: false, error, ...(code ? { code } : {}), ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

/**
 * The status a thrown error deserves.
 *
 * Pure and exported so the mapping can be asserted rather than discovered from
 * a phone. The distinction that matters to the app is 401 against 403: the
 * first means sign in again, the second means do not ask again — so a missing
 * permission must never arrive as "your session expired", which would put the
 * app in a loop of signing a user back in to be refused the same way.
 */
export function statusForError(err: unknown): { status: number; error: string; code?: string } {
  if (err instanceof AuthRequiredError) return { status: 401, error: err.message, code: "auth" };
  if (err instanceof PermissionError) return { status: 403, error: err.message, code: err.code };
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return { status: 422, error: first?.message ?? "That does not look right." };
  }
  if (err instanceof Error) return { status: 400, error: err.message };
  return { status: 500, error: "Something went wrong." };
}

/**
 * Resolves the actor from the Authorization header.
 *
 * A token that verifies is not enough — `buildAuthContext` still checks the
 * Session row for revocation and the user for ACTIVE, so signing a device out
 * from Administration takes effect on the phone's very next request.
 */
export async function mobileActor(req: Request): Promise<AuthContext | null> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return null;
  return getAuthContextFromToken(token);
}

export type MobileHandler = (
  req: Request,
  actor: AuthContext,
) => Promise<Response> | Response;

/**
 * Wraps a route handler in the guard every mobile endpoint needs.
 *
 * `codes` are the same ones the web page passes to `requirePermission()` or the
 * server action passes to `authorize()` — stated per route rather than inferred
 * from the path, so adding an endpoint means naming its permission in the same
 * change, exactly as adding a screen does.
 */
export function mobileRoute(codes: string[], handler: MobileHandler) {
  return async function route(req: Request): Promise<Response> {
    let actor: AuthContext | null;
    try {
      actor = await mobileActor(req);
    } catch {
      // A malformed or unverifiable token is an unauthenticated request, not a
      // server fault — the app should sign in again rather than retry.
      return apiFail(401, "Sign-in required.", "auth");
    }
    if (!actor) return apiFail(401, "Sign-in required.", "auth");

    const required = [PERM.admin.mobile.use, ...codes];
    const missing = required.find((c) => !actor.has(c));
    if (missing) {
      return apiFail(
        403,
        missing === PERM.admin.mobile.use
          ? "This account is not allowed to use the mobile app."
          : `You do not have permission to do that (${missing}).`,
        missing,
      );
    }

    try {
      return await handler(req, actor);
    } catch (err) {
      const { status, error, code } = statusForError(err);
      return apiFail(status, error, code);
    }
  };
}

/** What the app is told about the signed-in person, on login and on refresh. */
export function actorPayload(actor: AuthContext) {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    employeeCode: actor.employeeCode,
    isSuperAdmin: actor.isSuperAdmin,
    roles: actor.roles.map((r) => ({ code: r.code, name: r.name, level: r.level })),
    /*
     * The whole resolved set, so the app can hide a control the way `<Can>`
     * does on the web. It is a courtesy only: the server re-checks every code
     * on every request, and a super admin carries an empty set with `has()`
     * answering true for everything — which is why that flag is sent too.
     */
    permissions: [...actor.permissions].sort(),
  };
}
