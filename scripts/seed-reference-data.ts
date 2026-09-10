/**
 * Seeds the reference data Workforce and the Knowledge Base need to be usable,
 * and nothing else.
 *
 *   pnpm seed:reference
 *
 * Safe on a deployed environment: it creates employment types, the design's
 * employees and its knowledge base articles if they are missing, and leaves
 * users, passwords, masters and transactional data untouched. The full seed is
 * not safe there — it resets the six account passwords.
 */
import { PrismaClient } from "@prisma/client";
import { seedWorkforceAndKb } from "../prisma/workforce-seed";

const prisma = new PrismaClient();

async function main() {
  console.log("\nSeeding workforce and knowledge base reference data\n");
  await seedWorkforceAndKb(prisma);
  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
