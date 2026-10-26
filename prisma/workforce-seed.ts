/**
 * Reference data for Riders & Staff: the employment types and a handful of
 * demo people.
 *
 *   pnpm seed:reference
 *
 * Kept apart from the seed for the same reason the role matrix is: it has to be
 * runnable on a deployed environment, where the full seed is not — that would
 * reset user passwords. Idempotent.
 */
import type { PrismaClient } from "@prisma/client";

/** Rider, Internal Staff and Team Leader are the SOW's three kinds of person. */
const EMPLOYMENT_TYPES = ["Rider", "Internal Staff", "Team Leader"];

/** A few demo riders and one internal staff member, so screens are not empty. */
const EMPLOYEES: Array<[code: string, name: string, type: string, designation: string, mobile: string, aadhaar: string]> = [
  ["NL001", "Ramesh Yadav", "Rider", "Delivery Rider", "+91 98450 66120", "4821 7734 9012"],
  ["NL002", "Suresh Kumar", "Rider", "Delivery Rider", "+91 99860 22417", "6712 4409 3355"],
  ["NL003", "Imran Sheikh", "Rider", "Delivery Rider", "+91 90190 77345", "7823 1120 4457"],
  ["NL004", "Prakash Nair", "Rider", "Delivery Rider", "+91 96320 18876", "2298 6654 1130"],
  ["NL005", "Kavitha Rao", "Internal Staff", "Accountant", "+91 97400 55231", "3341 8890 2264"],
];

export async function seedWorkforce(prisma: PrismaClient) {
  for (const [i, name] of EMPLOYMENT_TYPES.entries()) {
    await prisma.employmentType.upsert({
      where: { name },
      create: { name, sortOrder: i },
      update: { sortOrder: i },
    });
  }
  const typeIds = new Map((await prisma.employmentType.findMany()).map((t) => [t.name, t.id]));
  const desigIds = new Map((await prisma.designation.findMany()).map((d) => [d.name, d.id]));

  for (const [employeeCode, name, type, designation, mobile, aadhaar] of EMPLOYEES) {
    await prisma.employee.upsert({
      where: { employeeCode },
      create: {
        employeeCode,
        name,
        mobile,
        aadhaar,
        employmentTypeId: typeIds.get(type)!,
        designationId: desigIds.get(designation) ?? null,
      },
      update: { name, mobile, employmentTypeId: typeIds.get(type)! },
    });
  }

  // The Rider ID series continues after the demo riders, not over them.
  const series = await prisma.numberingSeries.findFirst({ where: { documentKey: "RIDER" } });
  if (series && series.nextNumber <= EMPLOYEES.length) {
    await prisma.numberingSeries.update({ where: { id: series.id }, data: { nextNumber: EMPLOYEES.length + 1 } });
  }

  console.log(`  workforce: ${EMPLOYEES.length} people, ${EMPLOYMENT_TYPES.length} employment types`);
}
