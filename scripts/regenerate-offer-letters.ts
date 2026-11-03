import "dotenv/config";
/**
 * Re-renders every accepted employee's offer letter on the current letterhead,
 * after re-applying the seeded wording to the two standard templates (the seed
 * leaves an existing template's text alone, so a database seeded before the
 * letterhead shipped still carries the old short body).
 *
 *   pnpm letters:regen                   # refresh templates, then every letter
 *   pnpm letters:regen --keep-templates  # letters only; Admin's wording stays
 */
import { PrismaClient } from "@prisma/client";

import { OFFER_TEMPLATES } from "../prisma/masters-seed";
import { generateOfferLetter } from "../src/lib/hr/offer-letter-service";

const prisma = new PrismaClient();
const keepTemplates = process.argv.includes("--keep-templates");

async function main() {
  if (!keepTemplates) {
    for (const t of OFFER_TEMPLATES) {
      await prisma.offerLetterTemplate.update({ where: { code: t.code }, data: { subject: t.subject, body: t.body } });
      console.log(`  template ${t.code} refreshed`);
    }
  }

  const employees = await prisma.employee.findMany({
    where: { onboardingStatus: "ACCEPTED", status: "ACTIVE" },
    select: { id: true, name: true, employeeCode: true },
    orderBy: { employeeCode: "asc" },
  });
  let done = 0;
  let skipped = 0;
  for (const e of employees) {
    const result = await generateOfferLetter(e.id);
    if (result.ok) done++;
    else skipped++;
    console.log(`  ${e.employeeCode} ${e.name} → ${result.ok ? "regenerated" : `skipped (${result.reason})`}`);
  }
  console.log(`\n${employees.length} accepted; ${done} regenerated, ${skipped} skipped.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
