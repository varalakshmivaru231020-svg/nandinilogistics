/**
 * The role access matrix — the proposed default from the scope document.
 *
 * Lives apart from the seed because it has to be appliable on its own: adding a
 * permission puts it in the catalogue, but no role holds it until the grants are
 * recomputed. On a deployed environment re-running the whole seed is not an
 * option — it would reset user passwords and demo data — so `pnpm perms:grants`
 * runs just this part.
 */
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/registry";

// ---------------------------------------------------------------------------
// Permission matching — rules use `*` as a segment wildcard.
//   "masters.*.view"        every master's view permission
//   "material.indent.*"     every indent action
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

function resolveCodes(grant: string[], deny: string[] = []): string[] {
  return PERMISSIONS.filter(
    (p) => grant.some((r) => matches(p.code, r)) && !deny.some((r) => matches(p.code, r)),
  ).map((p) => p.code);
}

// ---------------------------------------------------------------------------
// THE DEFAULT ROLE ACCESS MATRIX
// The scope document calls this "the proposed default, not a hard-coded rule" —
// every one of these grants is editable from Administration → Roles.
// ---------------------------------------------------------------------------

/**
 * What every working role needs to take part in Task Management.
 *
 * The scope document's Assigner, Assignee, Reviewer and Approver are positions
 * on a particular task, not job titles — anyone may raise a task, be given one,
 * or be named on a review level. So the codes go to every role, and
 * src/lib/tasks/lifecycle.ts decides who may act on the task in front of them.
 *
 * What is NOT here is deliberate: reopening a closed task, reassigning an
 * assignee or a level, seeing everyone's tasks and seeing everyone's score stay
 * with Owner / Admin, which the scope gives full control.
 */
const TASK_PARTICIPANT = [
  "task.task.view",
  "task.task.create",
  "task.task.update",
  "task.task.accept",
  "task.task.start",
  "task.task.complete",
  "task.task.comment",
  "task.task.requestExtension",
  "task.task.approveExtension",
  "task.task.close",
  "task.task.sendBack",
  "task.level.review",
  "task.level.approve",
  "checklist.checklist.view",
  "checklist.category.view",
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
    code: "OWNER_ADMIN",
    name: "Owner / Admin",
    description: "Sees everything, approves what matters, owns masters and users.",
    level: 10,
    grant: ["*"],
    // Duties, not access: the owner can open everything, but should not be
    // handed a share of every new lead or every lapsed follow-up.
    deny: ["sales.lead.receiveAssignment", "sales.followUp.receiveEscalation"],
  },
  {
    code: "PROJECT_MANAGER",
    name: "Project Manager",
    description: "Runs the project end to end — structure, schedule, first-level approvals.",
    level: 20,
    grant: [
      ...TASK_PARTICIPANT,

      "dashboard.projectManager.view",
      "approvals.queue.view",
      "dashboard.widget.viewFinancials",
      "project.*.*",
      "schedule.*.*",
      "hr.*.*",
      "kb.article.view",
      "kb.article.create",
      "kb.article.update",
      "material.indent.*",
      "material.purchaseOrder.view",
      "material.purchaseOrder.approvePm",
      "material.purchaseOrder.export",
      "material.purchaseOrder.print",
      "material.purchaseOrder.viewRate",
      "material.purchaseOrder.tab*",
      "material.grn.view",
      "material.grn.export",
      "material.stock.view",
      "material.stock.export",
      "material.stock.viewValuation",
      "material.stock.viewLedger",
      "material.reorder.view",
      "material.issue.view",
      "material.issue.export",
      "masters.*.view",
      "reports.budgetVsActual.*",
      "reports.scheduleVariance.*",
      "reports.projectProgress.*",
      "reports.consumptionVsIndent.*",
      "reports.indentAgeing.*",
      "reports.stockValuation.view",
    ],
    deny: [
      "project.project.delete",
      "project.project.accessAll",
      // Approval is the Project Manager's one step; the admin level survives
      // only to clear indents left by the old two-step chain, and that stays
      // with Owner / Admin.
      "material.indent.approveAdmin",
    ],
  },
  {
    code: "SUPERVISOR",
    name: "Supervisor",
    description: "Executes and reports from site — raises indents, receives material, logs progress.",
    level: 30,
    grant: [
      ...TASK_PARTICIPANT,

      "dashboard.supervisor.view",
      "project.project.view",
      "project.project.tabOverview",
      "project.project.tabWbs",
      "project.project.tabProgress",
      "project.project.tabSchedule",
      "project.phase.view",
      "project.workPackage.view",
      "project.block.view",
      "project.progressLog.view",
      "project.progressLog.create",
      "project.progressLog.update",
      "project.document.view",
      "project.document.download",
      "hr.employee.view",
      "hr.employee.tabStaff",
      "hr.employee.create",
      "hr.employee.update",
      "hr.employmentType.view",
      "hr.attendance.view",
      "hr.attendance.mark",
      "hr.attendance.markAll",
      "kb.article.view",
      "schedule.activity.view",
      "schedule.activity.updateProgress",
      "schedule.activity.start",
      "schedule.activity.complete",
      "schedule.gantt.view",
      "schedule.extension.view",
      "schedule.extension.request",
      "material.indent.view",
      "material.indent.create",
      "material.indent.update",
      "material.indent.delete",
      "material.indent.submit",
      "material.indent.print",
      "material.indent.tabItems",
      "material.indent.tabApprovals",
      "material.issue.view",
      "material.issue.acknowledge",
      "material.return.view",
      "material.return.create",
      "material.stock.view",
      "masters.item.view",
      "masters.uom.view",
      "masters.itemCategory.view",
    ],
  },
  {
    code: "STORE_MANAGER",
    name: "Store Manager",
    description: "Controls material and stock — PO, GRN, issue, return, transfer, vendor payments.",
    level: 30,
    grant: [
      ...TASK_PARTICIPANT,

      "material.vendor.manageCategories",
      "material.vendor.viewPerformance",
      "material.vendor.view",
      "kb.article.view",
      "dashboard.storeManager.view",
      "approvals.queue.view",
      "dashboard.widget.viewFinancials",
      "project.project.view",
      "material.indent.view",
      "material.indent.viewAll",
      // The store raises indents too, alongside the site and the PM.
      "material.indent.create",
      "material.indent.update",
      "material.indent.submit",
      "material.indent.stockCheck",
      "material.indent.print",
      "material.indent.export",
      "material.indent.tab*",
      "material.indent.viewAgeing",
      "material.purchaseOrder.*",
      "material.grn.*",
      "material.vendorInvoice.*",
      "material.vendorPayment.*",
      "material.stock.*",
      "material.reorder.view",
      "material.issue.*",
      "material.return.*",
      "material.transfer.*",
      "masters.item.*",
      "masters.itemCategory.*",
      "masters.uom.view",
      "masters.vendor.*",
      "masters.store.view",
      "masters.taxRate.view",
      "masters.paymentTerm.view",
      "reports.stockValuation.*",
      "reports.openPurchaseOrders.*",
      "reports.vendorOutstanding.*",
      "reports.consumptionVsIndent.*",
    ],
    deny: [
      "material.purchaseOrder.approve",
      "material.vendorInvoice.overrideMismatch",
      "material.vendorInvoice.approve",
      "masters.item.delete",
      "masters.vendor.delete",
    ],
  },
  {
    code: "SALES_HEAD",
    name: "Sales Head",
    description: "Owns the pipeline — assignment, discount approval, pricing and hold extensions.",
    level: 25,
    grant: [
      ...TASK_PARTICIPANT,

      "kb.article.view",
      "dashboard.sales.view",
      "dashboard.widget.viewFinancials",
      "sales.*.*",
      "unit.*.*",
      "project.project.view",
      "masters.leadSource.*",
      "masters.lostReason.*",
      "masters.chargeHead.view",
      "masters.bank.view",
      "masters.unitType.view",
      "reports.salesFunnel.*",
      "reports.leadPerformance.*",
      "reports.collections.*",
      "reports.unitAvailability.*",
      "reports.bookingRegister.*",
    ],
    // The head supervises the pipeline and receives escalations; new leads go
    // to the executives, not into the head's own queue.
    deny: ["unit.unit.delete", "sales.customer.delete", "sales.lead.receiveAssignment"],
  },
  {
    code: "SALES",
    name: "Sales Executive",
    description: "Owns lead to booking — follow-ups, site visits, cost sheets, collections.",
    level: 30,
    grant: [
      ...TASK_PARTICIPANT,

      "kb.article.view",
      "dashboard.sales.view",
      "sales.lead.view",
      "sales.lead.create",
      "sales.lead.receiveAssignment",
      "sales.lead.update",
      "sales.lead.changeStage",
      "sales.lead.markLost",
      "sales.lead.viewContact",
      "sales.lead.export",
      "sales.lead.tab*",
      "sales.lead.note",
      "sales.lead.uploadFile",
      "sales.lead.sendMail",
      "sales.followUp.*",
      "sales.siteVisit.*",
      "sales.customer.view",
      "sales.customer.create",
      "sales.customer.update",
      "sales.customer.viewKyc",
      "sales.costSheet.view",
      "sales.costSheet.create",
      "sales.costSheet.update",
      "sales.costSheet.print",
      "sales.booking.view",
      "sales.booking.create",
      "sales.booking.update",
      "sales.booking.print",
      "sales.booking.tab*",
      "sales.demand.view",
      "sales.receipt.view",
      "sales.receipt.create",
      "sales.receipt.print",
      "unit.board.view",
      "unit.unit.view",
      "unit.unit.viewPrice",
      "unit.hold.view",
      "unit.hold.create",
      "unit.hold.release",
      "unit.priceList.view",
      "reports.unitAvailability.view",
      "reports.salesFunnel.view",
    ],
    // sales.followUp.* above would otherwise include the escalation duty, and an
    // executive should not be the one told that their own follow-up has lapsed.
    deny: ["sales.costSheet.approveDiscount", "sales.booking.cancel", "sales.followUp.receiveEscalation"],
  },
];

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export async function applyRoleGrants(prisma: PrismaClient) {
  const permIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        name: r.name,
        description: r.description,
        level: r.level,
        isSystem: true,
      },
      update: { name: r.name, description: r.description, level: r.level },
    });

    const codes = resolveCodes(r.grant, r.deny);
    // Replace the grant set wholesale so re-seeding reflects matrix edits here.
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

