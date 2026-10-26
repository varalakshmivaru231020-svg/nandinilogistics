import "dotenv/config";
/**
 * Syncs the permission catalogue in the database with the registry.
 *
 *   pnpm perms:sync
 *
 * Upserts every registry code, refreshes labels/groups/kinds, and REPORTS
 * (never silently deletes) codes that exist in the database but no longer in
 * the registry — deleting one would silently strip access from a live role.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/registry";

const prisma = new PrismaClient();

async function main() {
  console.log(`Syncing ${PERMISSIONS.length} permissions...`);

  let created = 0;
  let updated = 0;

  for (const p of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { code: p.code } });
    if (existing) {
      const changed =
        existing.label !== p.label ||
        existing.group !== p.group ||
        existing.kind !== p.kind ||
        existing.module !== p.module ||
        existing.resource !== p.resource ||
        existing.action !== p.action ||
        (existing.description ?? null) !== (p.description ?? null);
      if (changed) {
        await prisma.permission.update({
          where: { code: p.code },
          data: {
            module: p.module,
            resource: p.resource,
            action: p.action,
            label: p.label,
            description: p.description ?? null,
            group: p.group,
            kind: p.kind,
          },
        });
        updated++;
      }
    } else {
      await prisma.permission.create({
        data: {
          code: p.code,
          module: p.module,
          resource: p.resource,
          action: p.action,
          label: p.label,
          description: p.description ?? null,
          group: p.group,
          kind: p.kind,
        },
      });
      created++;
    }
  }

  const codes = new Set(PERMISSIONS.map((p) => p.code));
  const orphans = (await prisma.permission.findMany({ select: { code: true } }))
    .map((p) => p.code)
    .filter((c) => !codes.has(c));

  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  unchanged: ${PERMISSIONS.length - created - updated}`);

  if (orphans.length) {
    console.warn(`\n  ${orphans.length} permission(s) in the database are no longer in the registry:`);
    for (const c of orphans) console.warn(`    - ${c}`);
    console.warn("  They were NOT deleted. Remove them deliberately once no role holds them.");
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
