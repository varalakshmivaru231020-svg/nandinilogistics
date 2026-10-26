/**
 * Reference data for the CRM: the lead stages and the capture form's system
 * fields.
 *
 * Idempotent — every write is an upsert keyed on the row's code or field key,
 * so renaming a stage here renames it in place and the leads pointing at it
 * keep their link. Safe to run on a deployed environment.
 */
import type { PrismaClient } from "@prisma/client";

/** The SOW's five stages, in its order. Admin may add, rename or reorder them. */
const STAGES = [
  { code: "NEW", name: "New", kind: "NEW", sortOrder: 1 },
  { code: "INTERESTED", name: "Interested", kind: "OPEN", sortOrder: 2 },
  { code: "TRAINING", name: "Training", kind: "OPEN", sortOrder: 3 },
  { code: "ONBOARDING", name: "Onboarding", kind: "ONBOARDING", sortOrder: 4 },
  { code: "LOST", name: "Lost", kind: "LOST", sortOrder: 5 },
] as const;

/**
 * The capture form's system fields — the New stage's name, mobile, company
 * and location, and the rest of the lead record. Their `fieldKey` is the name
 * the action reads; the label and whether they are mandatory are Admin's.
 */
const SYSTEM_FIELDS = [
  { fieldKey: "name", label: "Name", type: "TEXT", required: true },
  { fieldKey: "phone", label: "Mobile number", type: "PHONE", required: true },
  { fieldKey: "companyIds", label: "Company", type: "DROPDOWN", required: false },
  { fieldKey: "location", label: "Location", type: "TEXT", required: false },
  { fieldKey: "ownerId", label: "Assign to tele-caller", type: "DROPDOWN", required: true },
  { fieldKey: "altPhone", label: "Alternate number", type: "PHONE", required: false },
  { fieldKey: "email", label: "Email", type: "EMAIL", required: false },
  { fieldKey: "requirement", label: "Notes", type: "DESCRIPTION", required: false },
  { fieldKey: "nextActionAt", label: "Next follow-up on", type: "DATE", required: false },
] as const;

export async function seedLeadReference(prisma: PrismaClient) {
  for (const s of STAGES) {
    await prisma.leadStage.upsert({
      where: { code: s.code },
      create: { ...s },
      update: { name: s.name, kind: s.kind, sortOrder: s.sortOrder },
    });
  }

  // Fields the old form carried and the SOW does not.
  await prisma.leadFormField.deleteMany({
    where: {
      isSystem: true,
      fieldKey: { in: ["sourceId", "projectId", "unitTypeId", "budgetMax", "budgetMin", "siteVisitPlanned"] },
    },
  });

  for (const [i, f] of SYSTEM_FIELDS.entries()) {
    await prisma.leadFormField.upsert({
      where: { fieldKey: f.fieldKey },
      create: { ...f, isSystem: true, sortOrder: i },
      update: { type: f.type, isSystem: true, sortOrder: i },
    });
  }

  console.log(`  lead stages: ${STAGES.length}, form fields: ${SYSTEM_FIELDS.length}`);
}
