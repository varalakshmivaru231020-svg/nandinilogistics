import { bearerToken, revokeSessionToken, verifySessionToken } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { apiOk } from "@/lib/api/mobile";

/**
 * Signing out a device.
 *
 * Always 200, and never guarded. A token this refuses to revoke is a token the
 * app is about to throw away anyway, and answering 401 would leave the phone
 * holding a session it believes is still live. It is also the one endpoint that
 * must work for an account whose mobile access has since been taken away —
 * being locked out is no reason to leave a session open on the device.
 */
export async function POST(req: Request): Promise<Response> {
  const token = bearerToken(req.headers.get("authorization"));
  const payload = token ? await verifySessionToken(token) : null;

  if (payload) {
    await revokeSessionToken(payload.tokenId);
    await recordAudit({
      action: "LOGOUT",
      entity: "User",
      entityId: payload.userId,
      userId: payload.userId,
      summary: `${payload.name} signed out of a mobile device`,
    });
  }

  return apiOk({ signedOut: true });
}
