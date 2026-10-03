/**
 * Removes permissions the registry no longer has — and only when nobody holds
 * them.
 *
 *   pnpm perms:prune            # say what would go
 *   pnpm perms:prune --write    # remove it
 *
 * `perms:sync` deliberately never deletes: a code that vanishes from the
 * registry by accident would take every grant of it with it, and nobody would
 * notice until somebody lost a screen. So retiring one is a separate decision,
 * made after looking, and refused outright while any role or user still holds
 * it.
 */
import { PrismaClient } from "@prisma/client";

import { PERMISSIONS } from "../src/lib/permissions/registry";

const prisma = new PrismaClient();
const write = process.argv.includes("--write");

async function main() {
  const known = new Set(PERMISSIONS.map((p) => p.code));
  const rows = await prisma.permission.findMany({ select: { id: true, code: true } });
  const stale = rows.filter((r) => !known.has(r.code));

  console.log(`\n${rows.length} in the database, ${known.size} in the registry, ${stale.length} stale\n`);
  if (stale.length === 0) {
    console.log("Nothing to prune.\n");
    return;
  }

  const removable: string[] = [];
  for (const s of stale) {
    const roles = await prisma.rolePermission.count({ where: { permissionId: s.id } });
    const users = await prisma.userPermission.count({ where: { permissionId: s.id } });
    if (roles + users > 0) {
      console.log(`  keep   ${s.code} — still held by ${roles} role(s) and ${users} user override(s)`);
    } else {
      console.log(`  remove ${s.code} — nobody holds it`);
      removable.push(s.id);
    }
  }

  if (!write) {
    console.log(`\nRun again with --write to remove ${removable.length}.\n`);
    return;
  }
  const { count } = await prisma.permission.deleteMany({ where: { id: { in: removable } } });
  console.log(`\nRemoved ${count}.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
