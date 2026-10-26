import "dotenv/config";
/**
 * Applies every piece of reference data the platform needs, and nothing else.
 *
 *   pnpm seed:reference
 *
 * Safe on a deployed environment, and run by deploy.sh: masters, lead stages,
 * lead form fields, employment types and demo people are all upserted on their
 * code, so a rename lands in place and anything pointing at the row keeps its
 * link. Users, passwords and transactional data are untouched — the full seed
 * is not safe on a live box because it resets the demo account passwords.
 */
import { PrismaClient } from "@prisma/client";
import { seedMasters } from "../prisma/masters-seed";
import { seedLeadReference } from "../prisma/lead-seed";
import { seedWorkforce } from "../prisma/workforce-seed";

const prisma = new PrismaClient();

async function main() {
  console.log("\nSeeding reference data\n");
  await seedMasters(prisma);
  await seedLeadReference(prisma);
  await seedWorkforce(prisma);
  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
