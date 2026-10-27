import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { apiFail } from "@/lib/api/mobile";
import { completeMobileSignIn, readJson } from "@/lib/api/mobile-signin";
import { findUserByMobile } from "@/lib/api/mobile-users";

/**
 * Signing in with a mobile number and a 4-digit PIN — how riders and Team
 * Leaders use the app (SOW §3.6–3.7). The PIN is checked against
 * `User.pinHash`; everything after that is the email login's own path.
 */
const Body = z.object({
  mobile: z.string().trim().min(1, "Mobile number is required"),
  pin: z.string().trim().regex(/^\d{4}$/, "The PIN must be exactly 4 digits"),
  device: z.string().trim().max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const read = await readJson(req);
  if (!read.ok) return read.res;

  const parsed = Body.safeParse(read.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return apiFail(422, Object.values(flat)[0]?.[0] ?? "That does not look right.", undefined, flat);
  }
  const { mobile, pin, device } = parsed.data;

  // One message whichever was wrong — never reveal whether the number exists.
  const invalid = () => apiFail(401, "Mobile number or PIN is incorrect.", "credentials");

  const user = await findUserByMobile(mobile);
  if (!user || !user.pinHash) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user?.id,
      userId: user?.id,
      summary: user ? `Failed PIN sign-in for ${user.email} — no PIN set` : "Failed PIN sign-in for an unknown mobile number",
    });
    return invalid();
  }

  if (!(await verifyPassword(pin, user.pinHash))) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      summary: `Failed PIN sign-in for ${user.email}`,
    });
    return invalid();
  }

  return completeMobileSignIn(req, user, device, { how: "PIN" });
}
