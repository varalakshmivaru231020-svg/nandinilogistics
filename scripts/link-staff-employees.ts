import "dotenv/config";
/**
 * One-off backfill: gives every staff login without a person record one, so
 * Tele-callers and Team Leaders can check in (see src/lib/hr/staff-link.ts).
 * Super admins and riders are skipped. Safe to run again — a linked login is
 * left alone.
 *
 *   pnpm staff:link
 */
import { PrismaClient } from "@prisma/client";

import { linkStaffEmployee } from "../src/lib/hr/staff-link";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { employee: null, isSuperAdmin: false },
    select: { id: true, name: true, phone: true, isSuperAdmin: true, roles: { select: { role: { select: { code: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  let created = 0;
  let linked = 0;
  for (const u of users) {
    const result = await prisma.$transaction((tx) =>
      linkStaffEmployee(tx, { ...u, roleCodes: u.roles.map((r) => r.role.code) }, new Date()),
    );
    if (!result) continue;
    if (result.created) created++;
    if (result.linked) linked++;
    console.log(`  ${u.name} → ${result.created ? "created" : result.linked ? "linked" : "already linked"}`);
  }
  console.log(`\n${users.length} logins without a person record; ${created} created, ${linked} linked.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
