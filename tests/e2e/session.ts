import { SignJWT } from "jose";
import { randomUUID } from "crypto";

import { prisma } from "../integration/helpers";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Mints a real, revocable session the running app will accept. */
export async function sessionFor(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No seeded user ${email}. Run \`pnpm db:seed\`.`);

  const tokenId = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + 3600_000),
      userAgent: "vitest-e2e",
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

export async function revokeTestSessions() {
  await prisma.session.deleteMany({ where: { userAgent: "vitest-e2e" } });
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
