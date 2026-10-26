import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { resolveEffectivePermissions } from "./resolve";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The active users who hold a permission as a *duty* — being handed new
 * leads, being told when a follow-up lapses.
 *
 * Resolved with exactly the rules used at sign-in (roles, allow and deny
 * overrides), with one deliberate difference: a super-admin's bypass does not
 * count. The bypass means "may open anything", not "should be given the work",
 * and treating it as the latter would route leads and escalations to whoever
 * happens to administer the system.
 */
export async function usersHolding(db: Db, code: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              id: true, code: true, name: true, level: true, status: true,
              permissions: { select: { permission: { select: { code: true } } } },
            },
          },
        },
      },
      permissions: { select: { effect: true, permission: { select: { code: true } } } },
    },
  });

  return users
    .filter((u) => {
      const { granted } = resolveEffectivePermissions(
        u.roles.map((ur) => ({
          id: ur.role.id,
          code: ur.role.code,
          name: ur.role.name,
          level: ur.role.level,
          status: ur.role.status,
          permissionCodes: ur.role.permissions.map((rp) => rp.permission.code),
        })),
        u.permissions.map((up) => ({ code: up.permission.code, effect: up.effect })),
      );
      return granted.has(code);
    })
    .map((u) => u.id);
}
