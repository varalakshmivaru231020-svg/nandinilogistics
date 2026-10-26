/**
 * Master reference data — states, cities, departments, designations, the
 * client companies, lost reasons and the numbering series.
 *
 *   pnpm seed:reference
 *
 * Kept apart from the seed so it can be applied to a deployed environment,
 * where the full seed cannot run — that would reset user passwords. Every
 * write is an upsert keyed on the row's code, so renaming a master here
 * renames it in place and anything already pointing at it keeps its link.
 */
import type { PrismaClient } from "@prisma/client";

const STATES = [
  { code: "KA", name: "Karnataka", gstCode: "29" },
  { code: "TG", name: "Telangana", gstCode: "36" },
  { code: "TN", name: "Tamil Nadu", gstCode: "33" },
];

const CITIES: Array<[string, string]> = [
  ["Bengaluru", "KA"],
  ["Mysuru", "KA"],
  ["Hyderabad", "TG"],
  ["Chennai", "TN"],
];

const DEPARTMENTS = [
  { code: "OPS", name: "Operations" },
  { code: "CRM", name: "Tele-calling & Onboarding" },
  { code: "ACC", name: "Accounts" },
  { code: "ADMIN", name: "Administration" },
];

const DESIGNATIONS: Array<[string, string, string]> = [
  ["ADMIN", "Administrator", "ADMIN"],
  ["TL", "Team Leader", "OPS"],
  ["TELE", "Tele-caller", "CRM"],
  ["RIDER", "Delivery Rider", "OPS"],
  ["ACCT", "Accountant", "ACC"],
];

/**
 * The SOW's initial companies (§3.3). Internal Staff is treated as a company
 * for payout purposes.
 */
const COMPANIES = [
  { code: "PEEKO", name: "Peeko" },
  { code: "SLIKK", name: "Slikk" },
  { code: "PURPLE", name: "Purple" },
  { code: "FIRSTCLUB", name: "First Club" },
  { code: "INTERNAL", name: "Internal Staff", legalName: "Nandini Logistics — internal staff" },
];

const ADVANCE_REASONS = [
  { code: "MEDICAL", name: "Medical emergency" },
  { code: "FAMILY", name: "Family need" },
  { code: "VEHICLE", name: "Vehicle repair" },
  { code: "RENT", name: "House rent" },
  { code: "OTHER", name: "Other" },
];

const OFFER_TEMPLATES = [
  {
    code: "VENDOR_STD",
    name: "Standard offer — vendor rider",
    audience: "VENDOR" as const,
    subject: "Offer of engagement as a delivery rider — {{company}}",
    body: [
      "Dear {{name}},",
      "",
      "We are pleased to engage you as a delivery rider with Nandini Logistics, deployed to {{company}}, from {{joiningDate}}. Your Rider ID is {{riderId}}.",
      "",
      "Your payout follows the rate card: {{rateCard}}. Payouts are made weekly after deductions for any advance, bike rent and TDS.",
      "",
      "Please keep your ID card with you on duty.",
      "",
      "Nandini Logistics",
    ].join("\n"),
  },
  {
    code: "INTERNAL_STD",
    name: "Standard offer — internal staff",
    audience: "INTERNAL" as const,
    subject: "Offer of employment — Nandini Logistics",
    body: [
      "Dear {{name}},",
      "",
      "We are pleased to offer you employment with Nandini Logistics from {{joiningDate}}. Your employee ID is {{riderId}}.",
      "",
      "Your monthly salary and deductions will be shown on your payslip.",
      "",
      "Nandini Logistics",
    ].join("\n"),
  },
];

/** The SOW's one column layout for the four client companies' weekly sheets. */
export const WEEKLY_COLUMN_MAP = {
  riderCode: "Rider ID",
  totalPayout: "Total Payout",
  advance: "Advance Amount",
  bikeRental: "Bike Rental",
  tds: "TDS",
  finalPayout: "Final Payout",
};

/** Internal staff arrive monthly with payroll words instead. */
export const MONTHLY_COLUMN_MAP = {
  riderCode: "Employee ID",
  totalPayout: "Gross Salary",
  advance: "Advance",
  bikeRental: "",
  tds: "Deductions",
  finalPayout: "Net Pay",
};

const LOST_REASONS = [
  { code: "NOT_INTERESTED", name: "Not interested" },
  { code: "JOINED_ELSEWHERE", name: "Joined elsewhere" },
  { code: "NO_VEHICLE", name: "No vehicle" },
  { code: "NO_DOCUMENTS", name: "Documents not available" },
  { code: "UNREACHABLE", name: "Not reachable" },
];

/**
 * The series the platform numbers from. The Rider ID is the SOW's "NL001" —
 * three digits, no separator; the prefix is editable from the master.
 */
export const NUMBERING = [
  { documentKey: "RIDER", prefix: "NL", padding: 3 },
  { documentKey: "LEAD", prefix: "LD", padding: 5 },
  { documentKey: "TASK", prefix: "TSK", padding: 4 },
  { documentKey: "INVOICE", prefix: "NLI", padding: 4 },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function seedMasters(prisma: PrismaClient) {
  for (const s of STATES) {
    await prisma.state.upsert({ where: { code: s.code }, create: s, update: s });
  }
  const stateIds = new Map((await prisma.state.findMany()).map((s) => [s.code, s.id]));

  for (const [name, stateCode] of CITIES) {
    const stateId = stateIds.get(stateCode)!;
    await prisma.city.upsert({
      where: { name_stateId: { name, stateId } },
      create: { name, stateId },
      update: {},
    });
  }
  const cityIds = new Map((await prisma.city.findMany()).map((c) => [c.name, c.id]));

  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { code: d.code }, create: d, update: d });
  }
  const deptIds = new Map((await prisma.department.findMany()).map((d) => [d.code, d.id]));

  for (const [code, name, deptCode] of DESIGNATIONS) {
    const data = { code, name, departmentId: deptIds.get(deptCode) ?? null };
    await prisma.designation.upsert({ where: { code }, create: data, update: data });
  }

  for (const c of COMPANIES) {
    const monthly = c.code === "INTERNAL";
    const data = {
      ...c,
      cityId: cityIds.get("Bengaluru") ?? null,
      payoutCycle: monthly ? ("MONTHLY" as const) : ("WEEKLY" as const),
      payoutColumnMap: monthly ? MONTHLY_COLUMN_MAP : WEEKLY_COLUMN_MAP,
    };
    await prisma.company.upsert({ where: { code: c.code }, create: data, update: { name: c.name } });
  }

  for (const r of ADVANCE_REASONS) {
    await prisma.advanceReason.upsert({ where: { code: r.code }, create: r, update: r });
  }

  for (const t of OFFER_TEMPLATES) {
    await prisma.offerLetterTemplate.upsert({ where: { code: t.code }, create: t, update: { name: t.name, audience: t.audience } });
  }
  const templates = new Map((await prisma.offerLetterTemplate.findMany()).map((t) => [t.code, t.id]));
  await prisma.company.updateMany({
    where: { offerTemplateVendorId: null, code: { not: "INTERNAL" } },
    data: { offerTemplateVendorId: templates.get("VENDOR_STD") ?? null },
  });
  await prisma.company.updateMany({
    where: { offerTemplateInternalId: null },
    data: { offerTemplateInternalId: templates.get("INTERNAL_STD") ?? null },
  });

  for (const r of LOST_REASONS) {
    await prisma.lostReason.upsert({ where: { code: r.code }, create: r, update: r });
  }

  for (const n of NUMBERING) {
    const existing = await prisma.numberingSeries.findFirst({ where: { documentKey: n.documentKey } });
    if (!existing) await prisma.numberingSeries.create({ data: n });
  }

  console.log("  masters seeded");
}
