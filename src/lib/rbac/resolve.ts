/**
 * Pure permission resolution — the security-critical core, kept free of Prisma
 * and of `server-only` so it can be asserted directly.
 *
 * Order, and it matters:
 *   1. Union of permissions from every ACTIVE role held.
 *   2. Plus per-user ALLOW overrides.
 *   3. Minus per-user DENY overrides.
 *
 * DENY is applied last and is absolute.
 */

export interface RoleInput {
  id: string;
  code: string;
  name: string;
  level: number;
  status: string;
  permissionCodes: string[];
  approvalLimits: Array<{ scope: string; maxValue: number }>;
}

export interface OverrideInput {
  code: string;
  effect: "ALLOW" | "DENY";
}

export interface ResolvedAccess {
  granted: Set<string>;
  roles: Array<{ id: string; code: string; name: string; level: number }>;
  approvalLimits: Record<string, number>;
}

export function resolveEffectivePermissions(
  roles: RoleInput[],
  overrides: OverrideInput[],
  userLimits: Array<{ scope: string; maxValue: number }> = [],
): ResolvedAccess {
  const activeRoles = roles.filter((r) => r.status === "ACTIVE");

  const granted = new Set<string>();
  for (const role of activeRoles) {
    for (const code of role.permissionCodes) granted.add(code);
  }

  for (const o of overrides) {
    if (o.effect === "ALLOW") granted.add(o.code);
  }
  // Applied last, so a DENY beats both a role grant and an ALLOW override.
  for (const o of overrides) {
    if (o.effect === "DENY") granted.delete(o.code);
  }

  // The most generous role ceiling applies, unless a personal limit replaces it.
  const approvalLimits: Record<string, number> = {};
  for (const role of activeRoles) {
    for (const limit of role.approvalLimits) {
      approvalLimits[limit.scope] = Math.max(approvalLimits[limit.scope] ?? 0, limit.maxValue);
    }
  }
  for (const limit of userLimits) {
    approvalLimits[limit.scope] = limit.maxValue;
  }

  return {
    granted,
    roles: activeRoles.map((r) => ({ id: r.id, code: r.code, name: r.name, level: r.level })),
    approvalLimits,
  };
}
