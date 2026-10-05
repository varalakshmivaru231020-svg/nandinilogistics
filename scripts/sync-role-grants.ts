/**
 * Brings the roles in the database into line with the matrix in
 * prisma/role-matrix.ts, and touches nothing else.
 *
 *   pnpm perms:grants            # add roles that do not exist yet
 *   pnpm perms:grants --add      # also give existing roles matrix codes they lack
 *   pnpm perms:grants --reset    # put every existing role back to the matrix
 *
 * Adding a permission to the registry puts it in the catalogue (perms:sync),
 * but no role holds it until the grants are worked out.
 *
 * The default adds what is missing and leaves what is there, because a role
 * tuned through Administration → Roles is somebody's decision and a deploy has
 * no business undoing it.
 *
 * `--add` is how a permission added in a release reaches the roles meant to
 * hold it: it grants what the matrix says and removes nothing. It will put back
 * a permission somebody deliberately took off a role, which is why it is run
 * knowingly rather than on every deploy.
 *
 * `--reset` puts every role back to the shipped matrix, customisation and all —
 * right on a fresh environment and destructive on an established one.
 *
 * Either way each role's recorded default is refreshed for the roles it writes,
 * so "Restore the default" has something to restore to.
 */
import { PrismaClient } from "@prisma/client";
import { applyRoleGrants } from "../prisma/role-matrix";

const prisma = new PrismaClient();
const reset = process.argv.includes("--reset");
const add = process.argv.includes("--add");

async function main() {
  const before = await prisma.rolePermission.count();
  console.log(
    reset
      ? `\nResetting every role to the matrix (${before} grants in place)\n`
      : add
        ? `\nGiving every role the matrix codes it lacks, removing nothing (${before} grants in place)\n`
        : `\nAdding any role the matrix has and the database does not (${before} grants in place)\n`,
  );
  await applyRoleGrants(prisma, { onlyMissing: !reset && !add, add });
  const after = await prisma.rolePermission.count();
  console.log(`\n  ${before} → ${after} role permissions\n`);
  if (!reset && !add && after === before) {
    console.log("  Nothing was missing. Use --add to hand out permissions added since.\n");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
