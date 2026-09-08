import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { readSessionToken } from "@/lib/auth/session";
import { PERM } from "@/lib/permissions/codes";
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
  /** Resolved permission codes. Empty for a super admin — use `has()` instead. */
  permissions: Set<string>;
  /** Project ids the user is mapped to. Meaningless when `canAccessAllProjects`. */
  projectIds: string[];
  canAccessAllProjects: boolean;
  /** Approval ceilings by scope, e.g. { "material.indent": 500000 }. */
  approvalLimits: Record<string, number>;
  has: (code: string) => boolean;
  hasAny: (...codes: string[]) => boolean;
  hasAll: (...codes: string[]) => boolean;
  /** Highest ceiling the user carries for an approval chain, from role or personal limit. */
  approvalLimitFor: (scope: string) => number;
}

/**
 * Loads the current actor for this request. Memoised with React `cache`, so
 * a page that guards ten buttons still hits the database once.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSessionToken();
  if (!session) return null;

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
              approvalLimits: true,
            },
          },
        },
      },
      permissions: { include: { permission: { select: { code: true } } } },
      projectAccess: { select: { projectId: true } },
      approvalLimits: true,
    },
  });

  if (!user || user.status !== "ACTIVE") return null;

  // Resolution itself lives in ./resolve.ts so it can be unit-tested.
  const { granted, roles, approvalLimits: roleLimits } = resolveEffectivePermissions(
    user.roles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
      level: ur.role.level,
      status: ur.role.status,
      permissionCodes: ur.role.permissions.map((rp) => rp.permission.code),
      approvalLimits: ur.role.approvalLimits.map((l) => ({
        scope: l.scope,
        maxValue: Number(l.maxValue),
      })),
    })),
    user.permissions.map((up) => ({ code: up.permission.code, effect: up.effect })),
    user.approvalLimits.map((l) => ({ scope: l.scope, maxValue: Number(l.maxValue) })),
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
    projectIds: user.projectAccess.map((p) => p.projectId),
    canAccessAllProjects: has(PERM.project.project.accessAll),
    approvalLimits: roleLimits,
    has,
    hasAny: (...codes) => codes.some(has),
    hasAll: (...codes) => codes.every(has),
    approvalLimitFor: (scope) => roleLimits[scope] ?? 0,
  };
});

/**
 * Prisma `where` fragment that keeps a query inside the user's mapped projects.
 * Returns `{}` for users who may see everything.
 */
export function projectScopeFilter(
  ctx: AuthContext,
  field = "projectId",
): Record<string, unknown> {
  if (ctx.canAccessAllProjects) return {};
  return { [field]: { in: ctx.projectIds } };
}
