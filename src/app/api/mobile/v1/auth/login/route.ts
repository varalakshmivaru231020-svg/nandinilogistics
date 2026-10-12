import { z } from "zod";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, revokeSessionToken } from "@/lib/auth/session";
import { PERM } from "@/lib/permissions/codes";
import { buildAuthContext } from "@/lib/rbac/context";
import { actorPayload, apiFail, apiOk } from "@/lib/api/mobile";

/**
 * Signing in from a device.
 *
 * Deliberately not the web login action: that one sets a cookie and redirects
 * to the project chooser. This returns the token in the body and the whole
 * resolved permission set with it, so the app can draw its first screen without
 * a second round trip — and knows immediately which of its twenty modules it is
 * allowed to show at all.
 *
 * The session it mints is an ordinary one. It appears in Administration →
 * Active sessions beside the browsers, with the device name as its user agent,
 * and revoking it there stops the phone on its next request.
 */
const Body = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  /** Something an administrator can recognise in the session list. */
  device: z.string().trim().max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiFail(400, "Send a JSON body.");
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return apiFail(422, Object.values(flat)[0]?.[0] ?? "That does not look right.", undefined, flat);
  }
  const { email, password, device } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true, email: true, name: true, passwordHash: true,
      status: true, isSuperAdmin: true,
    },
  });

  // The same message either way — never reveal whether the address exists.
  const invalid = () => apiFail(401, "Email or password is incorrect.", "credentials");

  if (!user) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Failed mobile sign-in for unknown address ${email}`,
    });
    return invalid();
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      summary: `Failed mobile sign-in for ${user.email}`,
    });
    return invalid();
  }

  if (user.status !== "ACTIVE") {
    return apiFail(403, "This account is not active. Contact your administrator.", "inactive");
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { token, tokenId, expiresAt } = await issueSession(user, {
    userAgent: device ? `Mobile · ${device}` : "Mobile",
    ipAddress: ip,
  });

  /*
   * The permission is checked after the session is minted rather than before,
   * so the one code path that resolves permissions is the one every other
   * request uses. A refusal revokes the session it just made — the row stays,
   * revoked, which is the record that this account tried to sign in from a
   * phone and was not allowed to.
   */
  const actor = await buildAuthContext(
    { userId: user.id, tokenId, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin },
    null,
  );

  if (!actor || !actor.has(PERM.admin.mobile.use)) {
    await revokeSessionToken(tokenId);
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      summary: `${user.name} was refused the mobile app — no ${PERM.admin.mobile.use}`,
    });
    return apiFail(
      403,
      "This account is not allowed to use the mobile app.",
      PERM.admin.mobile.use,
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    summary: `${user.name} signed in from ${device ?? "a mobile device"}`,
  });

  return apiOk({
    token,
    expiresAt: expiresAt.toISOString(),
    user: actorPayload(actor),
  });
}
