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
    const data = { ...c, cityId: cityIds.get("Bengaluru") ?? null };
    await prisma.company.upsert({ where: { code: c.code }, create: data, update: { name: c.name } });
  }

  for (const r of LOST_REASONS) {
    await prisma.lostReason.upsert({ where: { code: r.code }, create: r, update: r });
  }

  for (const n of NUMBERING) {
    const existing = await prisma.numberingSeries.findFirst({ where: { documentKey: n.documentKey } });
    if (!existing) await prisma.numberingSeries.create({ data: n });
  }

  console.log("  masters seeded");
}
