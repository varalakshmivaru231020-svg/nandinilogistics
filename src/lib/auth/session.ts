import "server-only";

import { cookies, headers } from "next/headers";
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
 * Mints a signed token and the Session row that can revoke it.
 *
 * Cookie-free on purpose. The browser wants this token in an httpOnly cookie;
 * the Android app wants it in a response body and will send it back as a bearer
 * header. Both are the same session — one row, one `tokenId`, revocable from
 * Administration → Active sessions either way — so there is one place that
 * mints them and the transport is decided by the caller.
 */
export async function issueSession(
  user: { id: string; email: string; name: string; isSuperAdmin: boolean },
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
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

  return { token, tokenId, expiresAt };
}

/** Issues a session and puts it in the browser's cookie jar. */
export async function createSession(
  user: { id: string; email: string; name: string; isSuperAdmin: boolean },
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<string> {
  const { token } = await issueSession(user, meta);

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

/**
 * Verifies a token's signature. Cookie-free, for the bearer path.
 *
 * Signature only — a signed token says who minted it, not whether the session
 * is still allowed to exist. Revocation and expiry are checked against the
 * Session row where the context is built.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * The bearer token in an Authorization header, or null.
 *
 * Takes the header value rather than the request so the parsing can be tested
 * without one. The scheme is matched case-insensitively because clients
 * disagree about it, and anything else — Basic, a bare token, a second
 * parameter — is not a bearer token and is refused rather than guessed at.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1].length > 0 ? parts[1] : null;
}

/** Revokes a session by its token id, whichever transport carried it. */
export async function revokeSessionToken(tokenId: string): Promise<void> {
  await prisma.session
    .updateMany({ where: { tokenId, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

/**
 * The session this request carries — from the cookie, or from the bearer
 * header when there is no cookie.
 *
 * The fallback is what lets the Android client run the real server actions
 * rather than reimplementations of them. An action resolves its actor through
 * `getAuthContext()`, which came through here, which read only the cookie: so
 * every one of the 152 actions answered "Sign-in required" to a phone holding a
 * perfectly good token. Rather than teach each action about bearer tokens, or
 * make the client send its token twice, the one place that reads a session
 * reads both.
 *
 * It takes nothing away from the browser. A cookie still wins, and a token in a
 * header is the stricter of the two — a cross-site form can make a browser send
 * a cookie, and cannot make it send this.
 *
 * Signature only; revocation and expiry are checked in `getAuthContext`.
 */
export async function readSessionToken(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (cookie) return verifySessionToken(cookie);

  const bearer = bearerToken((await headers()).get("authorization"));
  if (!bearer) return null;
  return verifySessionToken(bearer);
}

export async function destroySession(): Promise<void> {
  const payload = await readSessionToken();
  if (payload) await revokeSessionToken(payload.tokenId);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
