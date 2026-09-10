/**
 * Recomputes every role's permission grants from the matrix in
 * prisma/role-matrix.ts, and touches nothing else.
 *
 *   pnpm perms:grants
 *
 * Adding a permission to the registry puts it in the catalogue (perms:sync),
 * but no role holds it until the grants are recomputed. On a deployed
 * environment the full seed is not safe to re-run — it resets user passwords
 * and demo data — so this is the part that is.
 *
 * It replaces each role's grant set wholesale, so a role customised through
 * Administration → Roles is reset to the documented default. That is the point
 * on a fresh environment and a hazard on an established one: check with whoever
 * owns the access matrix before running it once real roles have been tuned.
 */
import { PrismaClient } from "@prisma/client";
import { applyRoleGrants } from "../prisma/role-matrix";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.rolePermission.count();
  console.log(`\nRecomputing role grants (${before} in place)\n`);
  await applyRoleGrants(prisma);
  const after = await prisma.rolePermission.count();
  console.log(`\n  ${before} → ${after} role permissions\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
