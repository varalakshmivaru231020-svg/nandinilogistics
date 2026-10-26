import "server-only";

import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { getAuthContext, type AuthContext } from "./context";

/** Thrown by action-layer guards. Caught and turned into a form error. */
export class PermissionError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? `You do not have permission to perform this action (${code}).`);
    this.name = "PermissionError";
    this.code = code;
  }
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign-in required.");
    this.name = "AuthRequiredError";
  }
}

/** For pages: sends an unauthenticated visitor to the login screen. */
export async function requireAuth(returnTo?: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return ctx;
}

/**
 * For pages: requires every code given, otherwise shows the access-denied screen.
 * The denied code is passed through so the screen can name the missing permission.
 */
export async function requirePermission(...codes: string[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  const missing = codes.find((c) => !ctx.has(c));
  if (missing) redirect(`/forbidden?code=${encodeURIComponent(missing)}`);
  return ctx;
}

/** For pages: requires at least one of the codes. */
export async function requireAnyPermission(...codes: string[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.hasAny(...codes)) {
    redirect(`/forbidden?code=${encodeURIComponent(codes[0] ?? "unknown")}`);
  }
  return ctx;
}

/** For server actions: throws instead of redirecting, so the form can show the error. */
export async function authorize(...codes: string[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthRequiredError();
  const missing = codes.find((c) => !ctx.has(c));
  if (missing) throw new PermissionError(missing);
  return ctx;
}

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

/** Wraps a server action so permission and validation failures become form errors. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message, code: err.code };
    if (err instanceof AuthRequiredError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "digest" in err) throw err; // Next redirect/notFound
    // A ZodError's own message is the whole issue list as JSON. What belongs on
    // screen is the first issue's message — "Name is required", not
    // [{"origin":"string","code":"too_small",…}].
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return { ok: false, error: first?.message ?? "That does not look right." };
    }
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: message };
  }
}
