/**
 * Reference data for Workforce and the Knowledge Base.
 *
 *   pnpm seed:reference
 *
 * Kept apart from the seed for the same reason the role matrix is: it has to be
 * runnable on a deployed environment, where the full seed is not — that would
 * reset user passwords and the demo project. This touches only employment
 * types, employees and knowledge base articles, and is idempotent.
 */
import type { PrismaClient } from "@prisma/client";

/* --------------------- Workforce and the knowledge base -------------------- */

const EMPLOYMENT_TYPES = ["Company Staff", "Contract Role", "Direct Labour"];

/** The people the design shows on site, with its own designations. */
const EMPLOYEES: Array<[name: string, type: string, designation: string, mobile: string, aadhaar: string]> = [
  ["Ramesh Yadav", "Direct Labour", "Mason", "+91 98450 66120", "4821 7734 9012"],
  ["Suresh Kumar", "Direct Labour", "Bar bender", "+91 99860 22417", "6712 4409 3355"],
  ["Anil Deshpande", "Company Staff", "Project Manager", "+91 98800 41190", "5590 2231 7788"],
  ["Kavitha Rao", "Company Staff", "Site Engineer", "+91 97400 55231", "3341 8890 2264"],
  ["Imran Sheikh", "Contract Role", "Electrician", "+91 90190 77345", "7823 1120 4457"],
  ["Prakash Nair", "Direct Labour", "Carpenter", "+91 96320 18876", "2298 6654 1130"],
];

/** The design's own knowledge base articles. */
const KB_ARTICLES: Array<[title: string, category: string, summary: string, body: string]> = [
  [
    "Sales pitch — NN Skyline",
    "Sales",
    "Approved talking points, USPs and comparison notes for Skyline.",
    "Covers amenities, connectivity to Whitefield tech parks, and the standard objection handling script for pricing questions.\n\nUse only the approved comparison set. Any discount beyond the published slab needs the sales head on the call.",
  ],
  [
    "Site safety induction",
    "Safety",
    "Mandatory induction for every worker and visitor entering an NN Infra site.",
    "PPE rules, exclusion zones, emergency assembly points and the incident reporting chain.\n\nNobody goes past the gate without induction. The supervisor records it the same day.",
  ],
  [
    "Indent & PO process guide",
    "Procurement",
    "Step-by-step guide for supervisors raising indents.",
    "Stock check first, activity linkage, value limits, and what happens at each approval level before a PO is issued.\n\nAn indent below the configured ceiling skips the Admin level automatically. Anything already in store is issued, and only the shortfall becomes a purchase order.",
  ],
  [
    "Booking & KYC checklist",
    "Sales",
    "Documents to collect at booking.",
    "ID proof, PAN, address proof, loan sanction letter if applicable — plus the token receipt and agreement timeline.\n\nKYC is verified before the agreement is drawn, never after.",
  ],
];

export async function seedWorkforceAndKb(prisma: PrismaClient) {
  for (const [i, name] of EMPLOYMENT_TYPES.entries()) {
    await prisma.employmentType.upsert({
      where: { name },
      create: { name, sortOrder: i },
      update: { sortOrder: i },
    });
  }
  const typeIds = new Map((await prisma.employmentType.findMany()).map((t) => [t.name, t.id]));
  const desigIds = new Map((await prisma.designation.findMany()).map((d) => [d.name, d.id]));

  for (const [i, [name, type, designation, mobile, aadhaar]] of EMPLOYEES.entries()) {
    const employeeCode = `EMP-${String(i + 1).padStart(4, "0")}`;
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
  console.log(`  workforce: ${EMPLOYEES.length} employees, ${EMPLOYMENT_TYPES.length} employment types`);

  const owner = await prisma.user.findFirst({ where: { email: "owner@nninfra.example" } });
  for (const [title, category, summary, body] of KB_ARTICLES) {
    const existing = await prisma.kbArticle.findFirst({ where: { title } });
    if (existing) continue;
    await prisma.kbArticle.create({
      data: { title, category, summary, body, authorId: owner?.id ?? null },
    });
  }
  console.log(`  knowledge base: ${KB_ARTICLES.length} articles`);
}

