import { SignJWT } from "jose";
import { randomUUID } from "crypto";

import { prisma } from "../integration/helpers";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Mints a real, revocable session the running app will accept.
 *
 * `label` names the test file that owns it, and it matters: vitest runs the
 * e2e files in parallel, and `revokeTestSessions` used to delete every session
 * tagged `vitest-e2e` — so whichever file finished first pulled the cookies out
 * from under the others, which then saw 307s to /login and reported the screen
 * as broken. One label per file, and each file revokes only its own.
 */
export async function sessionFor(email: string, label: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No seeded user ${email}. Run \`pnpm db:seed\`.`);

  const tokenId = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + 3600_000),
      userAgent: `vitest-e2e:${label}`,
    },
  });

  const token = await new SignJWT({
    userId: user.id, tokenId, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  return token;
}

/** Revokes one file's sessions, or every test session when given no label. */
export async function revokeTestSessions(label?: string) {
  await prisma.session.deleteMany({
    where: label
      ? { userAgent: `vitest-e2e:${label}` }
      : { userAgent: { startsWith: "vitest-e2e" } },
  });
}

export interface Visit {
  status: number;
  location: string | null;
  html: string;
}

export async function visit(path: string, token?: string): Promise<Visit> {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers: token ? { cookie: `nn_session=${token}` } : {},
  });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location"), html };
}

/** True when the app is up; the E2E suite is skipped otherwise. */
export async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
