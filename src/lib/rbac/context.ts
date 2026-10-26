import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import {
  readSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";
import { resolveEffectivePermissions } from "./resolve";

/**
 * The authenticated actor, with every permission already resolved.
 *
 * Resolution order — DENY always wins:
 *   1. Super admin short-circuits to "everything".
 *   2. Union of permissions from every ACTIVE role the user holds.
 *   3. Plus per-user ALLOW overrides.
 *   4. Minus per-user DENY overrides.
 */
export interface AuthContext {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  roles: Array<{ id: string; code: string; name: string; level: number }>;
  /**
   * Resolved permission codes — whatever this user's roles and overrides come
   * to, which for a super admin is not the same as what they may do. One who
   * holds no role has an empty set and may still do everything, so never read
   * this set to make a decision; call `has()`, which short-circuits on the flag.
   */
  permissions: Set<string>;
  has: (code: string) => boolean;
  hasAny: (...codes: string[]) => boolean;
  hasAll: (...codes: string[]) => boolean;
}

/**
 * Builds the actor from a verified session payload.
 *
 * Takes the payload rather than reading it, because the two transports find
 * it in different places: a browser sends a cookie, the Android app sends a
 * bearer header. Everything after that — revocation, status, permission
 * resolution — has to be identical for both, so it happens once, here.
 */
export async function buildAuthContext(session: SessionPayload): Promise<AuthContext | null> {
  // The JWT is signed, but the session row is what makes revocation immediate.
  const sessionRow = await prisma.session.findUnique({
    where: { tokenId: session.tokenId },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!sessionRow || sessionRow.revokedAt || sessionRow.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: { select: { code: true } } } },
            },
          },
        },
      },
      permissions: { include: { permission: { select: { code: true } } } },
    },
  });

  if (!user || user.status !== "ACTIVE") return null;

  // Resolution itself lives in ./resolve.ts so it can be unit-tested.
  const { granted, roles } = resolveEffectivePermissions(
    user.roles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
      level: ur.role.level,
      status: ur.role.status,
      permissionCodes: ur.role.permissions.map((rp) => rp.permission.code),
    })),
    user.permissions.map((up) => ({ code: up.permission.code, effect: up.effect })),
  );

  const isSuper = user.isSuperAdmin;
  const has = (code: string) => isSuper || granted.has(code);

  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    isSuperAdmin: isSuper,
    roles,
    permissions: granted,
    has,
    hasAny: (...codes) => codes.some(has),
    hasAll: (...codes) => codes.every(has),
  };
}

/**
 * Loads the current actor for this request from the session cookie. Memoised
 * with React `cache`, so a page that guards ten buttons still hits the
 * database once.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSessionToken();
  if (!session) return null;
  return buildAuthContext(session);
});

/**
 * The same actor, from a bearer token instead of a cookie.
 *
 * Not memoised: a route handler resolves the context once, and `cache` keys on
 * nothing here, so sharing it between two requests in one render pass would be
 * wrong rather than merely wasteful.
 */
export async function getAuthContextFromToken(token: string): Promise<AuthContext | null> {
  const session = await verifySessionToken(token);
  if (!session) return null;
  return buildAuthContext(session);
}
