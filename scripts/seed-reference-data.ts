/**
 * Applies every piece of reference data the platform needs, and nothing else.
 *
 *   pnpm seed:reference
 *
 * Safe on a deployed environment, and run by deploy.sh: masters, employment
 * types, employees and knowledge base articles are all upserted on their code,
 * so a rename lands in place and anything pointing at the row keeps its link.
 * Users, passwords and transactional data are untouched — the full seed is not
 * safe on a live box because it resets the six account passwords.
 *
 * Masters live here rather than in the seed because a master rename that never
 * reaches production is a silent divergence: the design's project types read
 * "Residential Apartment" in production for a day for exactly that reason.
 */
import { PrismaClient } from "@prisma/client";
import { seedMasters } from "../prisma/masters-seed";
import { seedWorkforceAndKb } from "../prisma/workforce-seed";

const prisma = new PrismaClient();

async function main() {
  console.log("\nSeeding reference data\n");
  await seedMasters(prisma);
  await seedWorkforceAndKb(prisma);
  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
