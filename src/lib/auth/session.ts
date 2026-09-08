import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "nn_session";

const MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS ?? 12);
const MAX_AGE_SECONDS = MAX_AGE_HOURS * 60 * 60;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export interface SessionPayload {
  userId: string;
  tokenId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/**
 * Issues a JWT and records a matching Session row, so an administrator can
 * revoke a signed-in device without waiting for the token to expire.
 */
export async function createSession(
  user: { id: string; email: string; name: string; isSuperAdmin: boolean },
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<string> {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  const token = await new SignJWT({
    userId: user.id,
    tokenId,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_HOURS}h`)
    .sign(secret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return token;
}

/** Verifies the cookie signature only. Revocation is checked in getCurrentUser. */
export async function readSessionToken(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const payload = await readSessionToken();
  if (payload) {
    await prisma.session
      .updateMany({
        where: { tokenId: payload.tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
