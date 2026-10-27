import "server-only";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { issueSession, revokeSessionToken } from "@/lib/auth/session";
import { PERM } from "@/lib/permissions/codes";
import { buildAuthContext } from "@/lib/rbac/context";

import { actorPayload, apiFail, apiOk } from "./mobile";

/**
 * The second half of every way into the app — email and password, mobile and
 * PIN, and a rider's own sign-up. Whatever proved who this is, the session is
 * minted, `admin.mobile.use` checked and the sign-in recorded the same way, and
 * the app is answered with the same `{ token, expiresAt, user }`.
 */
export interface SignInUser {
  id: string;
  email: string;
  name: string;
  status: string;
  isSuperAdmin: boolean;
}

export function requestIp(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function completeMobileSignIn(
  req: Request,
  user: SignInUser,
  device: string | undefined,
  opts: { status?: number; how?: string } = {},
): Promise<Response> {
  if (user.status !== "ACTIVE") {
    return apiFail(403, "This account is not active. Contact your administrator.", "inactive");
  }

  const { token, tokenId, expiresAt } = await issueSession(user, {
    userAgent: device ? `Mobile · ${device}` : "Mobile",
    ipAddress: requestIp(req),
  });

  /*
   * The permission is checked after the session is minted rather than before,
   * so the one code path that resolves permissions is the one every other
   * request uses. A refusal revokes the session it just made — the row stays,
   * revoked, which is the record that this account tried to sign in from a
   * phone and was not allowed to.
   */
  const actor = await buildAuthContext({
    userId: user.id, tokenId, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin,
  });

  if (!actor || !actor.has(PERM.admin.mobile.use)) {
    await revokeSessionToken(tokenId);
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      summary: `${user.name} was refused the mobile app — no ${PERM.admin.mobile.use}`,
    });
    return apiFail(403, "This account is not allowed to use the mobile app.", PERM.admin.mobile.use);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    summary: `${user.name} signed in from ${device ?? "a mobile device"}${opts.how ? ` (${opts.how})` : ""}`,
  });

  return apiOk(
    { token, expiresAt: expiresAt.toISOString(), user: actorPayload(actor) },
    opts.status ?? 200,
  );
}

/** Reads a JSON body, or answers 400 the way every auth route does. */
export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: apiFail(400, "Send a JSON body.") };
  }
}
