/**
 * THE PERMISSION REGISTRY — single source of truth.
 *
 * Rule of the codebase: nothing guarded is added to the platform without a
 * permission being registered here first. Every page, tab, list, button,
 * sensitive field, approval step and report has a code, and that code is what
 * gets assigned to roles and to individual admin users.
 *
 * Codes are always three parts: `module.resource.action`.
 *
 * After editing this file run:  pnpm perms:sync
 * That upserts new codes, updates labels, and reports codes that have
 * disappeared (it never silently deletes a permission that roles still hold).
 */

import type { ModuleDef, PermissionDef, PermissionKind } from "./types";

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboards", sortOrder: 10 },
  { key: "sales", label: "Leads · CRM", sortOrder: 20 },
  { key: "hr", label: "Riders & Attendance", sortOrder: 30 },
  { key: "task", label: "Task Management", sortOrder: 40 },
  { key: "payout", label: "Payouts", sortOrder: 50 },
  { key: "advance", label: "Advances & Bike Rent", sortOrder: 60 },
  { key: "accounts", label: "Accounts", sortOrder: 70 },
  { key: "staff", label: "Internal Staff", sortOrder: 80 },
  { key: "masters", label: "Masters", sortOrder: 90 },
  { key: "admin", label: "Administration", sortOrder: 100 },
  { key: "reports", label: "Reports", sortOrder: 110 },
];

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const registry: PermissionDef[] = [];
const seen = new Set<string>();

function add(def: PermissionDef): PermissionDef {
  if (seen.has(def.code)) {
    throw new Error(`Duplicate permission code in registry: ${def.code}`);
  }
  seen.add(def.code);
  registry.push(def);
  return def;
}

function perm(
  module: string,
  resource: string,
  action: string,
  label: string,
  group: string,
  kind: PermissionKind = "ACTION",
  description?: string,
): PermissionDef {
  return add({
    code: `${module}.${resource}.${action}`,
    module,
    resource,
    action,
    label,
    description,
    group,
    kind,
  });
}

type ExtraAction = [action: string, label: string, kind?: PermissionKind, description?: string];

/**
 * Registers the standard set for a CRUD resource, plus any extra actions.
 * `view` is the PAGE permission — without it the menu entry and route are gone.
 */
function crud(opts: {
  module: string;
  resource: string;
  /** Singular human label, e.g. "lead". */
  entity: string;
  group: string;
  create?: boolean;
  update?: boolean;
  remove?: boolean;
  exportable?: boolean;
  importable?: boolean;
  toggleStatus?: boolean;
  extra?: ExtraAction[];
}) {
  const {
    module,
    resource,
    entity,
    group,
    create = true,
    update = true,
    remove = true,
    exportable = true,
    importable = false,
    toggleStatus = false,
    extra = [],
  } = opts;

  perm(module, resource, "view", `View ${entity} list`, group, "PAGE");
  if (create) perm(module, resource, "create", `Create ${entity}`, group, "BUTTON");
  if (update) perm(module, resource, "update", `Edit ${entity}`, group, "BUTTON");
  if (remove) perm(module, resource, "delete", `Delete ${entity}`, group, "BUTTON");
  if (toggleStatus)
    perm(module, resource, "toggleStatus", `Activate / deactivate ${entity}`, group, "BUTTON");
  if (exportable) perm(module, resource, "export", `Export ${entity} list`, group, "BUTTON");
  if (importable) perm(module, resource, "import", `Bulk import ${entity}`, group, "BUTTON");

  for (const [action, label, kind = "ACTION", description] of extra) {
    perm(module, resource, action, label, group, kind, description);
  }
}

// ===========================================================================
// DASHBOARDS — one per role, as the SOW draws them
// ===========================================================================

const G_DASH = "Dashboards";

perm("dashboard", "admin", "view", "Admin dashboard", G_DASH, "PAGE",
  "Leads by stage, active riders by company, pending onboarding approvals, pending advance requests, payout status.");
perm("dashboard", "teamLeader", "view", "Team Leader dashboard", G_DASH, "PAGE",
  "My team, their payouts and attendance, advance requests waiting on me, my tasks.");
perm("dashboard", "teleCaller", "view", "Tele-caller dashboard", G_DASH, "PAGE",
  "Today's follow-ups, overdue follow-ups and leads by stage.");
perm("dashboard", "rider", "view", "Rider dashboard", G_DASH, "PAGE",
  "My ID card, this week's payout, attendance and referrals.");

// ===========================================================================
// CRM — LEAD MANAGEMENT (SOW §3.1)
// ===========================================================================

const G_LEAD = "CRM · Leads";

crud({
  module: "sales",
  resource: "lead",
  entity: "lead",
  group: G_LEAD,
  extra: [
    ["viewAll", "See leads owned by anyone", "ACTION", "Without it a tele-caller sees only their own leads."],
    ["assign", "Assign or reassign a lead", "BUTTON", "Admin and Team Leader assign at creation; a tele-caller may re-assign within the team."],
    ["changeStage", "Move a lead through the stages", "BUTTON"],
    ["markLost", "Mark a lead lost", "BUTTON", "A lost reason is mandatory."],
    ["viewContact", "See full mobile number", "FIELD", "When not granted, contact details are masked in lists."],
    ["tabTimeline", "Lead tab — Timeline", "TAB"],
    ["tabFollowUps", "Lead tab — Follow-ups", "TAB"],
    ["tabNotes", "Lead tab — Notes", "TAB"],
    ["tabStageHistory", "Lead tab — Stage history", "TAB"],
    ["tabFiles", "Lead tab — Files", "TAB"],
    ["note", "Add a note to a lead", "BUTTON"],
    ["uploadFile", "Attach a file to a lead", "BUTTON"],
  ],
});

crud({ module: "sales", resource: "followUp", entity: "follow-up", group: G_LEAD });

// Duties rather than access: who is handed new leads, and who is told when a
// follow-up lapses. Resolved without the super-admin bypass, so administering
// the system never quietly makes someone the recipient of the work.
perm("sales", "lead", "receiveAssignment", "Receive auto-assigned leads", G_LEAD, "ACTION",
  "Leads a rider refers are shared round-robin among everyone holding this — the tele-callers.");
perm("sales", "followUp", "receiveEscalation", "Receive overdue follow-up escalations", G_LEAD, "ACTION",
  "Notified when a lead's follow-up stays overdue past the grace period.");

// ===========================================================================
// RIDERS, INTERNAL STAFF & ATTENDANCE (SOW §3.2, §3.5, §3.8)
// ===========================================================================

const G_HR = "Riders & Attendance";

crud({
  module: "hr",
  resource: "employee",
  entity: "rider / staff record",
  group: G_HR,
  extra: [
    ["viewIdentity", "See Aadhaar, PAN and bank details", "FIELD", "Identity numbers are masked without it."],
    ["uploadDocument", "Attach a KYC document", "BUTTON"],
    ["tabStaff", "Workforce tab — People", "TAB"],
    ["viewAll", "See every rider, not only the team's", "ACTION", "A Team Leader sees the riders of the companies assigned to them; a tele-caller those they onboarded."],
    ["submitOnboarding", "Submit an onboarding form for review", "BUTTON"],
    ["acceptOnboarding", "Accept an onboarding form", "BUTTON", "Acceptance activates the rider and generates the ID card and offer letter."],
    ["rejectOnboarding", "Reject an onboarding form with a reason", "BUTTON"],
    ["offerLetter", "Generate, download or send the offer letter", "BUTTON"],
    ["idCard", "View the digital ID card", "BUTTON"],
    ["manageCompanies", "Change the companies a rider is deployed to", "BUTTON"],
    ["setPin", "Set or reset a rider's app PIN", "BUTTON", "The PIN is stored hashed; nobody can read it back."],
    ["requestEdit", "Ask for a change to one's own profile", "ACTION", "The change waits for someone with update to approve it."],
  ],
});

perm("hr", "referral", "view", "Referral history", G_HR, "PAGE", "Who referred whom, joining date, 25-day validity and eligibility.");
perm("hr", "referral", "export", "Export referral history", G_HR, "BUTTON");

crud({
  module: "hr",
  resource: "employmentType",
  entity: "employment type",
  group: G_HR,
  exportable: false,
});

perm("hr", "attendance", "view", "See attendance", G_HR, "TAB");
perm("hr", "attendance", "mark", "Mark attendance for a day", G_HR, "BUTTON", "Re-marking a day corrects it; it never stacks a second row.");
perm("hr", "attendance", "markAll", "Mark everyone present at once", G_HR, "BUTTON");
perm("hr", "attendance", "tabReport", "Workforce tab — Attendance report", G_HR, "TAB");
perm("hr", "attendance", "export", "Export the attendance report", G_HR, "BUTTON");
perm("hr", "attendance", "punch", "Punch in / out from the app", G_HR, "ACTION", "One's own attendance, with the phone's location.");

// ===========================================================================
// TASK MANAGEMENT (SOW §3.9) — Admin assigns, Team Leaders update
// ===========================================================================

const G_TASK = "Task Management";

crud({
  module: "task",
  resource: "task",
  entity: "task",
  group: G_TASK,
  extra: [
    ["start", "Start work on a task", "BUTTON"],
    ["complete", "Mark a task done", "BUTTON", "A remark is mandatory."],
    ["reopen", "Reopen a task marked done", "BUTTON"],
    ["comment", "Add a remark to a task", "BUTTON"],
    ["viewAll", "See every Team Leader's tasks, not only your own", "TAB"],
  ],
});

perm("task", "report", "view", "Task summary per Team Leader", G_TASK, "TAB", "Open, overdue and done per TL.");

// ===========================================================================
// PAYOUTS (SOW §3.4) — Admin imports, reviews and posts; everyone else reads
// ===========================================================================

const G_PAYOUT = "Payouts";

crud({
  module: "payout",
  resource: "import",
  entity: "payout import",
  group: G_PAYOUT,
  update: false,
  extra: [
    ["post", "Post a reviewed payout sheet", "BUTTON", "Posting is what makes the payout visible to riders and Team Leaders."],
    ["correct", "Match an unmatched row to a rider", "BUTTON"],
  ],
});

perm("payout", "payout", "view", "Payouts", G_PAYOUT, "PAGE", "A rider sees their own; a Team Leader their team's; a tele-caller the riders they onboarded.");
perm("payout", "payout", "viewAll", "See every rider's payout", G_PAYOUT, "ACTION");
perm("payout", "payout", "hold", "Hold or release a rider's payout", G_PAYOUT, "BUTTON", "A hold carries a reason.");
perm("payout", "payout", "export", "Export payouts", G_PAYOUT, "BUTTON");

// ===========================================================================
// ADVANCES & BIKE RENT (SOW §3.5, §3.6)
// ===========================================================================

const G_ADVANCE = "Advances & Bike Rent";

crud({
  module: "advance",
  resource: "advance",
  entity: "advance request",
  group: G_ADVANCE,
  update: false,
  extra: [
    ["viewAll", "See every rider's advances, not only the team's", "ACTION"],
    ["approve", "Approve or reject an advance request", "BUTTON", "Approval sets the recovery schedule; the deduction follows in the payout."],
  ],
});

crud({
  module: "advance",
  resource: "bikeRent",
  entity: "bike rent assignment",
  group: G_ADVANCE,
});

// ===========================================================================
// ACCOUNTS — invoices raised to client companies (SOW §3.5)
// ===========================================================================

const G_ACCOUNTS = "Accounts · Vendor Invoices";

crud({
  module: "accounts",
  resource: "invoice",
  entity: "client invoice",
  group: G_ACCOUNTS,
  extra: [
    ["recordPayment", "Record a payment received against an invoice", "BUTTON"],
  ],
});

// ===========================================================================
// INTERNAL STAFF — payslips (SOW §3.8)
// ===========================================================================

const G_STAFF = "Internal Staff";

crud({
  module: "staff",
  resource: "payslip",
  entity: "payslip",
  group: G_STAFF,
  update: false,
});

// ===========================================================================
// MASTERS — one CRUD block per registry master
// ===========================================================================

const MASTER_RESOURCES: Array<[resource: string, entity: string, group: string]> = [
  ["company", "client company", "Masters · Companies"],
  ["offerLetterTemplate", "offer letter template", "Masters · Companies"],
  ["advanceReason", "advance reason", "Masters · Advances"],
  ["department", "department", "Masters · Organisation"],
  ["designation", "designation", "Masters · Organisation"],
  ["state", "state", "Masters · Geography"],
  ["city", "city", "Masters · Geography"],
  ["leadStage", "lead stage", "Masters · CRM"],
  ["lostReason", "lost reason", "Masters · CRM"],
  ["leadField", "lead form field", "Masters · CRM"],
  ["numberingSeries", "numbering series", "Masters · System"],
];

for (const [resource, entity, group] of MASTER_RESOURCES) {
  crud({
    module: "masters",
    resource,
    entity,
    group,
    toggleStatus: true,
    importable: true,
  });
}

// The company has a screen of its own beyond the master list: its hubs, its
// Team Leaders, its rate card and its payout sheet mapping.
perm("masters", "company", "manageHubs", "Add or change a company's hubs", "Masters · Companies", "BUTTON");
perm("masters", "company", "assignTeamLeaders", "Assign Team Leaders to a company", "Masters · Companies", "BUTTON");
perm("masters", "company", "uploadRateCard", "Upload the company's rate card", "Masters · Companies", "BUTTON");
perm("masters", "company", "viewRateCard", "See the company's rate card", "Masters · Companies", "FIELD", "Admin and the assigned Team Leaders.");
perm("masters", "company", "mapPayoutColumns", "Map the company's payout sheet columns", "Masters · Companies", "BUTTON");

// ===========================================================================
// ADMINISTRATION — users, roles, permissions, audit
// ===========================================================================

const G_ADMIN_ACCESS = "Administration · Access Control";
const G_ADMIN_SYS = "Administration · System";

crud({
  module: "admin",
  resource: "user",
  entity: "user",
  group: G_ADMIN_ACCESS,
  toggleStatus: true,
  extra: [
    ["resetPassword", "Reset a user's password", "BUTTON"],
    ["assignRoles", "Assign roles to a user", "BUTTON"],
    ["assignPermissions", "Grant or deny individual permissions on a user", "BUTTON", "Per-user overrides sit on top of role grants. DENY always wins."],
    ["revokeSessions", "Sign a user out of every device", "BUTTON"],
    ["tabRoles", "User tab — Roles", "TAB"],
    ["tabPermissions", "User tab — Direct permissions", "TAB"],
    ["tabActivity", "User tab — Activity", "TAB"],
  ],
});

crud({
  module: "admin",
  resource: "role",
  entity: "role",
  group: G_ADMIN_ACCESS,
  toggleStatus: true,
  extra: [
    ["clone", "Clone a role with its permissions", "BUTTON"],
    ["managePermissions", "Edit the role permission matrix", "BUTTON", "The screen that decides what every other screen shows."],
    ["tabPermissions", "Role tab — Permission matrix", "TAB"],
    ["tabUsers", "Role tab — Users holding this role", "TAB"],
  ],
});

perm("admin", "permission", "view", "Permission catalogue", G_ADMIN_ACCESS, "PAGE");
perm("admin", "permission", "sync", "Sync the catalogue from the registry", G_ADMIN_ACCESS, "BUTTON");
perm("admin", "permission", "export", "Export the permission catalogue", G_ADMIN_ACCESS, "BUTTON");

perm("admin", "audit", "view", "Audit trail", G_ADMIN_SYS, "PAGE", "Every create, edit, approve and delete on the platform.");
perm("admin", "audit", "export", "Export audit trail", G_ADMIN_SYS, "BUTTON");
perm("admin", "session", "view", "Active sessions", G_ADMIN_SYS, "PAGE");
perm("admin", "session", "revoke", "Revoke a session", G_ADMIN_SYS, "BUTTON");

/*
 * The mobile app is a client, not a second system. It carries no permissions of
 * its own — every endpoint it calls re-checks the same codes the web screen
 * does. This is the one thing that is true of the phone and not of the desk:
 * taking it away stops a role signing in from a phone without changing
 * anything they may do at a desktop. Admin is web-only by the SOW, so Admin
 * does not hold it.
 */
perm("admin", "mobile", "use", "Sign in from the mobile app", G_ADMIN_SYS, "ACTION",
  "Without it the Android app refuses the sign-in even when the PIN is right.");
perm("admin", "settings", "view", "Platform settings", G_ADMIN_SYS, "PAGE");
perm("admin", "settings", "update", "Change platform settings", G_ADMIN_SYS, "BUTTON");

// ===========================================================================
// REPORTS — each is a page plus its export
// ===========================================================================

const G_REP = "Reports";

const REPORTS: Array<[key: string, label: string]> = [
  ["teamLeader", "TL report — active riders per Team Leader"],
  ["ridersByCompany", "Riders by company"],
  ["leadConversion", "Lead conversion"],
  ["payoutSummary", "Payout summary"],
  ["advanceOutstanding", "Advance outstanding"],
  ["teleCallerDaily", "Tele-caller daily summary"],
];

for (const [key, label] of REPORTS) {
  perm("reports", key, "view", label, G_REP, "REPORT");
  perm("reports", key, "export", `Export — ${label}`, G_REP, "BUTTON");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Every permission in the platform, in registration order. */
export const PERMISSIONS: readonly PermissionDef[] = registry;

/** Codes only — handy for typing and for set operations. */
export const PERMISSION_CODES = registry.map((p) => p.code);

export type PermissionCode = (typeof PERMISSION_CODES)[number];

const byCode = new Map(registry.map((p) => [p.code, p]));

export function getPermission(code: string): PermissionDef | undefined {
  return byCode.get(code);
}

/**
 * Permissions nothing asks for yet.
 *
 * Each of these is a real intention — a tab, an export, a delete — whose screen
 * has not been built, or whose control has since been withdrawn. They stay
 * registered so that roles already holding them are not disturbed and so the
 * intention is not lost, but they are kept out of the role-permission matrix:
 * a checkbox that changes nothing is worse than no checkbox, because it tells
 * whoever administers a role that they have locked something down when they
 * have not.
 *
 * tests/unit/permission-registry.test.ts holds this list to reality: a code
 * that starts guarding something, or stops existing, fails the test rather
 * than rotting here.
 */
export const NOT_YET_BUILT: ReadonlySet<string> = new Set([
  "admin.permission.sync",
  "admin.user.delete",
  "admin.user.revokeSessions",
  "hr.employee.uploadDocument",
  "hr.employmentType.update",
  "hr.employmentType.view",
  "masters.leadField.export",
  "masters.leadField.import",
  "masters.leadField.toggleStatus",
  "masters.leadField.view",
  "sales.followUp.delete",
  "sales.followUp.update",
  "sales.lead.delete",
]);

for (const p of registry) {
  if (NOT_YET_BUILT.has(p.code)) p.notYetBuilt = true;
}

/** The permissions the matrix offers — everything that actually guards something. */
export const LIVE_PERMISSIONS: PermissionDef[] = registry.filter((p) => !p.notYetBuilt);

export function permissionsByModule(moduleKey: string): PermissionDef[] {
  return registry.filter((p) => p.module === moduleKey);
}

/** Grouped for the role-permission matrix screen. */
export function permissionGroups(): Array<{ group: string; module: string; permissions: PermissionDef[] }> {
  const groups = new Map<string, PermissionDef[]>();
  for (const p of registry) {
    const list = groups.get(p.group) ?? [];
    list.push(p);
    groups.set(p.group, list);
  }
  return [...groups.entries()].map(([group, permissions]) => ({
    group,
    module: permissions[0].module,
    permissions,
  }));
}
