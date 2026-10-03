import { ROLES, resolveCodes } from "../../../prisma/role-matrix";

/**
 * What the shipped matrix says a role should hold.
 *
 * It is the fallback behind "restore": a role seeded before defaults existed,
 * or one nobody has saved a default for, still has something to go back to.
 * A role somebody made up themselves has none, and says so rather than
 * silently emptying itself.
 */
export function defaultCodesFor(roleCode: string): string[] | null {
  const seed = ROLES.find((r) => r.code === roleCode);
  if (!seed) return null;
  return resolveCodes(seed.grant, seed.deny);
}

/** The role codes the matrix ships, for telling a seeded role from a made-up one. */
export function shippedRoleCodes(): string[] {
  return ROLES.map((r) => r.code);
}
