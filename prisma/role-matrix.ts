/**
 * The role access matrix — the SOW's four roles (§2), as a proposed default.
 *
 * Lives apart from the seed because it has to be appliable on its own: adding a
 * permission puts it in the catalogue, but no role holds it until the grants are
 * recomputed. On a deployed environment re-running the whole seed is not an
 * option — it would reset user passwords — so `pnpm perms:grants` runs just
 * this part.
 */
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/registry";

// ---------------------------------------------------------------------------
// Permission matching — rules use `*` as a segment wildcard.
//   "masters.*.view"        every master's view permission
//   "sales.lead.*"          every lead action
//   "*"                     everything
// ---------------------------------------------------------------------------

export function matches(code: string, rule: string): boolean {
  if (rule === "*") return true;
  const ruleParts = rule.split(".");
  const codeParts = code.split(".");
  if (ruleParts.length !== codeParts.length) return false;
  return ruleParts.every((r, i) => segmentMatches(codeParts[i], r));
}

/** A rule segment may be `*`, a literal, or a partial wildcard such as `tab*`. */
function segmentMatches(segment: string, rule: string): boolean {
  if (rule === "*") return true;
  if (!rule.includes("*")) return rule === segment;
  const pattern = new RegExp(
    `^${rule.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`,
  );
  return pattern.test(segment);
}

export function resolveCodes(grant: string[], deny: string[] = []): string[] {
  return PERMISSIONS.filter(
    (p) => grant.some((r) => matches(p.code, r)) && !deny.some((r) => matches(p.code, r)),
  ).map((p) => p.code);
}

// ---------------------------------------------------------------------------
// THE DEFAULT ROLE ACCESS MATRIX
// Every one of these grants is editable from Administration → Roles.
// ---------------------------------------------------------------------------

/**
 * The mobile app is a client, not a second system: it carries no permissions of
 * its own, and every endpoint it calls re-checks the same codes the web screen
 * does. This one code is what an administrator takes away to stop a role
 * signing in from a phone. Admin is web-only by the SOW, so Admin never holds
 * it; every other role does.
 */
const MOBILE_APP = ["admin.mobile.use"];

/** Everything a person does on a lead once it is theirs to work. */
const WORK_A_LEAD = [
  "sales.lead.view",
  "sales.lead.create",
  "sales.lead.update",
  "sales.lead.changeStage",
  "sales.lead.markLost",
  "sales.lead.viewContact",
  "sales.lead.export",
  "sales.lead.tab*",
  "sales.lead.note",
  "sales.lead.uploadFile",
  "sales.followUp.view",
  "sales.followUp.create",
  "sales.followUp.export",
];

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  level: number;
  grant: string[];
  deny?: string[];
}

export const ROLES: RoleSeed[] = [
  {
    code: "ADMIN",
    name: "Admin",
    description: "Full system access — masters, riders and Team Leaders, companies, payouts, advances, bike rent, vendor invoices, internal staff, tasks and reports. Web only.",
    level: 10,
    grant: ["*"],
    deny: [
      // Web only, by the SOW.
      "admin.mobile.use",
      // Duties, not access: Admin can open everything, but should not be
      // handed a share of every new lead or every lapsed follow-up.
      "sales.lead.receiveAssignment",
      "sales.followUp.receiveEscalation",
    ],
  },
  {
    code: "TEAM_LEADER",
    name: "Team Leader",
    description: "Runs a team of riders — creates and assigns leads, reviews onboarding, approves advances, marks attendance, works tasks from Admin.",
    level: 20,
    grant: [
      ...MOBILE_APP,
      "dashboard.teamLeader.view",

      // Leads: create and assign to a tele-caller, re-assign, see the team's.
      ...WORK_A_LEAD,
      "sales.lead.viewAll",
      "sales.lead.assign",
      "sales.followUp.receiveEscalation",

      // The team: riders, their attendance, marked or corrected on their behalf.
      "hr.employee.view",
      "hr.employee.tabStaff",
      "hr.employee.export",
      "hr.attendance.view",
      "hr.attendance.mark",
      "hr.attendance.markAll",
      "hr.attendance.tabReport",
      "hr.attendance.export",
      "hr.attendance.punch",
      "hr.employee.requestEdit",

      // Tasks Admin assigns: view, start, finish, remark.
      "task.task.view",
      "task.task.start",
      "task.task.complete",
      "task.task.comment",
      "task.task.export",

      // Onboarding review for own team, the rider record and its ID card.
      "hr.employee.create",
      "hr.employee.update",
      "hr.employee.viewIdentity",
      "hr.employee.submitOnboarding",
      "hr.employee.acceptOnboarding",
      "hr.employee.rejectOnboarding",
      "hr.employee.offerLetter",
      "hr.employee.idCard",
      "hr.employee.manageCompanies",
      "hr.referral.view",

      // The team's payouts, read-only; advance approval; bike rent on view.
      "payout.payout.view",
      "payout.payout.export",
      "advance.advance.view",
      "advance.advance.create",
      "advance.advance.approve",
      "advance.advance.export",
      "advance.bikeRent.view",

      "masters.company.view",
      "masters.company.viewRateCard",
      "reports.teamLeader.view",
      "reports.teamLeader.export",
    ],
  },
  {
    code: "TELE_CALLER",
    name: "Tele-caller",
    description: "Works the leads assigned to them — follow-ups, stage changes, onboarding form and Rider ID — and sees the payout status of riders they onboarded.",
    level: 30,
    grant: [
      ...MOBILE_APP,
      "dashboard.teleCaller.view",

      // Own leads, handed round-robin; may re-assign within permissions.
      ...WORK_A_LEAD,
      "sales.lead.receiveAssignment",
      "sales.lead.assign",

      // The riders they onboard: the form, the Rider ID, submission for review.
      "hr.employee.view",
      "hr.employee.create",
      "hr.employee.update",
      "hr.employee.tabStaff",
      "hr.employee.viewIdentity",
      "hr.employee.submitOnboarding",
      "hr.employee.idCard",
      "hr.employee.manageCompanies",

      // Payout status of the riders they onboarded, read-only.
      "payout.payout.view",

      "masters.company.view",
      "reports.teleCallerDaily.view",
      "reports.teleCallerDaily.export",
    ],
  },
  {
    code: "RIDER",
    name: "Rider",
    description: "A delivery rider — self sign-up and KYC, digital ID card, referrals, weekly payout, advance requests, attendance punch in / out, lead referral.",
    level: 40,
    grant: [
      ...MOBILE_APP,
      "dashboard.rider.view",
      // Refer a prospective rider; the lead is auto-assigned to a tele-caller.
      "sales.lead.create",
      // Their own record, ID card, referrals, weekly payout and advances.
      "hr.employee.view",
      "hr.employee.idCard",
      "hr.referral.view",
      "payout.payout.view",
      "advance.advance.view",
      "advance.advance.create",
      "hr.attendance.view",
      "hr.attendance.mark",
      "hr.attendance.punch",
      "hr.employee.requestEdit",
    ],
  },
];

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Applies the shipped matrix to the roles, and records it as their default.
 *
 * Three modes, because the right one differs:
 *   onlyMissing  adds roles the database does not have and leaves the rest
 *                entirely alone. The deploy's mode.
 *   add          also gives existing roles the matrix codes they lack, without
 *                taking anything away. How a permission added in a release
 *                reaches the roles meant to hold it.
 *   (neither)    puts every role back to the matrix, customisation and all.
 */
export async function applyRoleGrants(
  prisma: PrismaClient,
  { onlyMissing = false, add = false }: { onlyMissing?: boolean; add?: boolean } = {},
) {
  const permIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  for (const r of ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: r.code }, select: { id: true } });
    const codes = resolveCodes(r.grant, r.deny);

    if (existing && (onlyMissing || add)) {
      if (onlyMissing) {
        console.log(`  role ${r.code.padEnd(16)} → left as it is`);
        continue;
      }
      // Additive: give it what the matrix says it should have and it does not,
      // and take nothing away.
      const held = new Set(
        (await prisma.rolePermission.findMany({
          where: { roleId: existing.id },
          select: { permission: { select: { code: true } } },
        })).map((x) => x.permission.code),
      );
      const missing = codes.filter((c) => !held.has(c));
      if (missing.length > 0) {
        await prisma.rolePermission.createMany({
          data: missing
            .map((c) => permIds.get(c))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ roleId: existing.id, permissionId })),
          skipDuplicates: true,
        });
      }
      console.log(`  role ${r.code.padEnd(16)} → +${missing.length} added, ${held.size} kept`);
      continue;
    }
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        name: r.name,
        description: r.description,
        level: r.level,
        isSystem: true,
        defaultCodes: codes,
      },
      update: {
        name: r.name,
        description: r.description,
        level: r.level,
        isSystem: true,
        defaultCodes: codes,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: codes
        .map((c) => permIds.get(c))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    console.log(`  role ${r.code.padEnd(16)} → ${codes.length} permissions`);
  }
}
