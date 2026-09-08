import { SignJWT } from "jose";
import { randomUUID } from "crypto";

import { prisma } from "./helpers";

/**
 * Lets server actions be called directly from tests.
 *
 * An action's guard chain is `authorize()` → `getAuthContext()` →
 * `readSessionToken()` → `cookies()`. Only that last hop needs a request, so
 * the test file stubs `next/headers` and hands the cookie holder here. The
 * permission resolution, the database reads and the business rules all run for
 * real.
 */
export interface CookieBox {
  value: string | null;
}

let box: CookieBox = { value: null };

/** Wires the harness to the hoisted holder the test file's `vi.mock` reads. */
export function bindCookieBox(shared: CookieBox) {
  box = shared;
}

/** Signs in as a seeded user for the calls that follow. */
export async function actAs(email: string): Promise<{ userId: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No seeded user ${email}. Run \`pnpm db:seed\`.`);

  const tokenId = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + 3600_000),
      userAgent: "vitest-actions",
    },
  });

  box.value = await new SignJWT({
    userId: user.id, tokenId, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  return { userId: user.id };
}

export function actAsNobody() {
  box.value = null;
}

export async function cleanupActionSessions() {
  await prisma.session.deleteMany({ where: { userAgent: "vitest-actions" } });
}
