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
  { key: "project", label: "Project Management", sortOrder: 20 },
  { key: "task", label: "Task Management", sortOrder: 30, pending: true },
  { key: "checklist", label: "Checklist Management", sortOrder: 40, pending: true },
  { key: "schedule", label: "Project Schedule", sortOrder: 50 },
  { key: "material", label: "Material & Inventory", sortOrder: 60 },
  { key: "sales", label: "Lead Management & Sales CRM", sortOrder: 70 },
  { key: "unit", label: "Available Flats", sortOrder: 80 },
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
  /** Singular human label, e.g. "material item". */
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
// DASHBOARDS — one per role, each built around what that person decides today
// ===========================================================================

const G_DASH = "Dashboards";

perm("dashboard", "owner", "view", "Owner dashboard", G_DASH, "PAGE", "Portfolio view, budget vs actual, sales funnel, collections, pending approvals.");
perm("dashboard", "projectManager", "view", "Project Manager dashboard", G_DASH, "PAGE", "Schedule variance, consumption vs budget, approvals waiting on me.");
perm("dashboard", "supervisor", "view", "Supervisor dashboard", G_DASH, "PAGE", "My indents, material issued to me, today's site log.");
perm("dashboard", "storeManager", "view", "Store Manager dashboard", G_DASH, "PAGE", "Stock and valuation, reorder alerts, open POs, vendor outstanding.");
perm("dashboard", "sales", "view", "Sales dashboard", G_DASH, "PAGE", "Leads by stage, follow-ups due, available units, bookings and collections.");
perm("dashboard", "widget", "viewFinancials", "See money figures on dashboards", G_DASH, "FIELD", "Hides every amount, budget and valuation tile when not granted.");

// ===========================================================================
// MODULE 01 — PROJECT MANAGEMENT
// ===========================================================================

const G_PROJ = "Projects";

crud({
  module: "project",
  resource: "project",
  entity: "project",
  group: G_PROJ,
  toggleStatus: true,
  extra: [
    ["changeStatus", "Change project status", "BUTTON"],
    ["accessAll", "Access every project", "ACTION", "Bypasses project-team mapping. Without it a user sees only projects they are mapped to."],
    ["viewBudget", "See project budget figures", "FIELD"],
    ["tabOverview", "Project tab — Overview", "TAB"],
    ["tabWbs", "Project tab — Work breakdown", "TAB"],
    ["tabTeam", "Project tab — Team", "TAB"],
    ["tabDocuments", "Project tab — Documents", "TAB"],
    ["tabProgress", "Project tab — Site progress", "TAB"],
    ["tabSchedule", "Project tab — Schedule", "TAB"],
    ["tabUnits", "Project tab — Units", "TAB"],
    ["tabFinancials", "Project tab — Financials", "TAB"],
  ],
});

crud({ module: "project", resource: "phase", entity: "project phase", group: G_PROJ, exportable: false });
crud({ module: "project", resource: "workPackage", entity: "work package", group: G_PROJ, exportable: false });
crud({ module: "project", resource: "block", entity: "block / tower", group: G_PROJ, exportable: false });

perm("project", "team", "view", "View project team", G_PROJ, "TAB");
perm("project", "team", "assign", "Map a user to a project", G_PROJ, "BUTTON");
perm("project", "team", "remove", "Remove a user from a project", G_PROJ, "BUTTON");

crud({
  module: "project",
  resource: "document",
  entity: "project document",
  group: G_PROJ,
  create: false,
  exportable: false,
  extra: [
    ["upload", "Upload project document", "BUTTON"],
    ["download", "Download project document", "BUTTON"],
    ["version", "Supersede with a new version", "BUTTON"],
  ],
});

crud({
  module: "project",
  resource: "progressLog",
  entity: "daily site progress log",
  group: G_PROJ,
  extra: [["viewAll", "See progress logs from every user", "ACTION"]],
});

// ===========================================================================
// MODULE 04 — PROJECT SCHEDULE
// ===========================================================================

const G_SCHED = "Project Schedule";

crud({
  module: "schedule",
  resource: "activity",
  entity: "schedule activity",
  group: G_SCHED,
  importable: true,
  extra: [
    ["updateProgress", "Update activity progress", "BUTTON"],
    ["captureDelay", "Record a delay reason", "BUTTON"],
  ],
});

perm("schedule", "gantt", "view", "Gantt view", G_SCHED, "TAB");
perm("schedule", "baseline", "view", "See baseline vs actual", G_SCHED, "TAB");
perm("schedule", "baseline", "set", "Freeze the baseline plan", G_SCHED, "BUTTON", "Once frozen the baseline is never edited, so slippage stays measurable.");
perm("schedule", "dependency", "manage", "Manage activity dependencies", G_SCHED, "BUTTON");
perm("schedule", "criticalPath", "view", "See the critical path", G_SCHED, "TAB");
perm("schedule", "template", "apply", "Start a schedule from a template", G_SCHED, "BUTTON");
perm("schedule", "template", "save", "Save a schedule as a template", G_SCHED, "BUTTON");

// ===========================================================================
// MODULE 05 — MATERIAL & INVENTORY
// The controlled chain: indent -> PM -> Admin -> stock check -> PO -> GRN ->
// invoice (3-way match) -> payment -> issue.
// ===========================================================================

const G_MAT_IND = "Material · Indents";
const G_MAT_PO = "Material · Purchase Orders";
const G_MAT_GRN = "Material · Goods Receipt";
const G_MAT_INV = "Material · Invoices & Payments";
const G_MAT_STK = "Material · Stock";

crud({
  module: "material",
  resource: "indent",
  entity: "indent",
  group: G_MAT_IND,
  extra: [
    ["viewAll", "See indents raised by anyone", "ACTION", "Without it a user sees only the indents they raised."],
    ["submit", "Submit indent for approval", "BUTTON"],
    ["approvePm", "Approve indent — Project Manager level", "BUTTON", "First-level approval. Subject to the configured approval value limit."],
    ["approveAdmin", "Approve indent — Owner / Admin level", "BUTTON", "Second level. Skipped automatically below the configured value limit."],
    ["reject", "Reject indent", "BUTTON"],
    ["reviseQty", "Revise requested quantity while approving", "BUTTON", "The revision is recorded on the approval trail."],
    ["cancel", "Cancel indent", "BUTTON"],
    ["stockCheck", "Run the stock check before purchase", "BUTTON", "Marks the portion issuable from store; only the shortfall becomes a PO."],
    ["print", "Print indent", "BUTTON"],
    ["tabItems", "Indent tab — Items", "TAB"],
    ["tabApprovals", "Indent tab — Approval trail", "TAB"],
    ["tabLinkedPo", "Indent tab — Linked purchase orders", "TAB"],
    ["viewAgeing", "See indent ageing (days pending)", "FIELD"],
  ],
});

crud({
  module: "material",
  resource: "purchaseOrder",
  entity: "purchase order",
  group: G_MAT_PO,
  extra: [
    ["approve", "Approve purchase order", "BUTTON"],
    ["cancel", "Cancel purchase order", "BUTTON"],
    ["close", "Close purchase order", "BUTTON"],
    ["print", "Print purchase order", "BUTTON"],
    ["viewRate", "See purchase rates and PO values", "FIELD"],
    ["tabItems", "PO tab — Items", "TAB"],
    ["tabReceipts", "PO tab — Goods receipts", "TAB"],
    ["tabInvoices", "PO tab — Invoices", "TAB"],
  ],
});

crud({
  module: "material",
  resource: "grn",
  entity: "goods receipt note",
  group: G_MAT_GRN,
  extra: [
    ["inspect", "Record inspection — accepted / rejected / short", "BUTTON"],
    ["post", "Post GRN to stock", "BUTTON", "Only accepted quantity enters the stock ledger."],
    ["cancel", "Cancel GRN", "BUTTON"],
    ["print", "Print GRN", "BUTTON"],
  ],
});

crud({
  module: "material",
  resource: "vendorInvoice",
  entity: "vendor invoice",
  group: G_MAT_INV,
  extra: [
    ["match", "Run the three-way match", "BUTTON", "Purchase Order ↔ GRN ↔ Invoice."],
    ["overrideMismatch", "Override a blocked mismatch", "BUTTON", "High-trust action — always audited."],
    ["approve", "Approve invoice for payment", "BUTTON"],
    ["cancel", "Cancel invoice", "BUTTON"],
  ],
});

crud({
  module: "material",
  resource: "vendorPayment",
  entity: "vendor payment",
  group: G_MAT_INV,
  update: false,
  extra: [["print", "Print payment advice", "BUTTON"]],
});

perm("material", "stock", "view", "Live stock position", G_MAT_STK, "PAGE");
perm("material", "stock", "export", "Export stock position", G_MAT_STK, "BUTTON");
perm("material", "stock", "viewValuation", "See stock valuation and average rate", G_MAT_STK, "FIELD");
perm("material", "stock", "adjust", "Post a stock adjustment", G_MAT_STK, "BUTTON");
perm("material", "stock", "audit", "Run a physical stock audit", G_MAT_STK, "BUTTON");
perm("material", "stock", "viewLedger", "View item stock ledger", G_MAT_STK, "TAB");
perm("material", "reorder", "view", "Reorder alert list", G_MAT_STK, "PAGE");

crud({
  module: "material",
  resource: "issue",
  entity: "material issue",
  group: G_MAT_STK,
  extra: [
    ["acknowledge", "Acknowledge material received", "BUTTON", "Signed by the receiving supervisor, on mobile."],
    ["print", "Print issue slip", "BUTTON"],
  ],
});

crud({
  module: "material",
  resource: "return",
  entity: "material return",
  group: G_MAT_STK,
  extra: [["approve", "Approve material return", "BUTTON"]],
});

crud({
  module: "material",
  resource: "transfer",
  entity: "inter-store transfer",
  group: G_MAT_STK,
  extra: [
    ["approve", "Approve stock transfer", "BUTTON"],
    ["receive", "Receive a transfer at destination store", "BUTTON"],
  ],
});

// ===========================================================================
// MODULE 06 — LEAD MANAGEMENT & SALES CRM
// ===========================================================================

const G_SALES_LEAD = "Sales · Leads";
const G_SALES_BOOK = "Sales · Bookings & Collections";

crud({
  module: "sales",
  resource: "lead",
  entity: "lead",
  group: G_SALES_LEAD,
  importable: true,
  extra: [
    ["viewAll", "See leads owned by anyone", "ACTION", "Without it a sales user sees only their own leads."],
    ["assign", "Assign or reassign a lead", "BUTTON"],
    ["changeStage", "Move a lead through the pipeline", "BUTTON"],
    ["markLost", "Mark a lead lost", "BUTTON", "A lost reason is mandatory."],
    ["merge", "Merge duplicate leads", "BUTTON"],
    ["viewContact", "See full phone number and email", "FIELD", "When not granted, contact details are masked in lists."],
    ["tabFollowUps", "Lead tab — Follow-ups", "TAB"],
    ["tabVisits", "Lead tab — Site visits", "TAB"],
    ["tabCostSheets", "Lead tab — Cost sheets", "TAB"],
  ],
});

crud({ module: "sales", resource: "followUp", entity: "follow-up", group: G_SALES_LEAD, exportable: false });

crud({
  module: "sales",
  resource: "siteVisit",
  entity: "site visit",
  group: G_SALES_LEAD,
  create: false,
  extra: [
    ["schedule", "Schedule a site visit", "BUTTON"],
    ["complete", "Record visit outcome", "BUTTON"],
    ["cancel", "Cancel a site visit", "BUTTON"],
  ],
});

crud({
  module: "sales",
  resource: "customer",
  entity: "customer",
  group: G_SALES_BOOK,
  extra: [
    ["verifyKyc", "Verify customer KYC", "BUTTON"],
    ["viewKyc", "See KYC documents", "FIELD"],
  ],
});

crud({
  module: "sales",
  resource: "costSheet",
  entity: "cost sheet",
  group: G_SALES_BOOK,
  extra: [
    ["approveDiscount", "Approve a discount on a cost sheet", "BUTTON"],
    ["print", "Print cost sheet", "BUTTON"],
  ],
});

crud({
  module: "sales",
  resource: "booking",
  entity: "booking",
  group: G_SALES_BOOK,
  remove: false,
  extra: [
    ["confirm", "Confirm booking", "BUTTON"],
    ["agreement", "Record agreement execution", "BUTTON"],
    ["register", "Record registration", "BUTTON"],
    ["cancel", "Cancel booking", "BUTTON"],
    ["print", "Print booking form", "BUTTON"],
    ["tabDemands", "Booking tab — Payment schedule", "TAB"],
    ["tabReceipts", "Booking tab — Receipts", "TAB"],
  ],
});

crud({
  module: "sales",
  resource: "demand",
  entity: "payment demand",
  group: G_SALES_BOOK,
  extra: [
    ["raise", "Raise a milestone demand", "BUTTON"],
    ["print", "Print demand letter", "BUTTON"],
  ],
});

crud({
  module: "sales",
  resource: "receipt",
  entity: "collection receipt",
  group: G_SALES_BOOK,
  update: false,
  extra: [["print", "Print receipt", "BUTTON"]],
});

// ===========================================================================
// MODULE 07 — AVAILABLE FLATS / UNIT INVENTORY
// ===========================================================================

const G_UNIT = "Available Flats";

crud({
  module: "unit",
  resource: "unit",
  entity: "unit",
  group: G_UNIT,
  importable: true,
  extra: [
    ["changeStatus", "Change unit status", "BUTTON"],
    ["viewPrice", "See unit pricing", "FIELD"],
  ],
});

perm("unit", "board", "view", "Availability board", G_UNIT, "PAGE", "Block-and-floor grid, colour-coded by unit status.");
perm("unit", "hold", "view", "View unit holds", G_UNIT, "TAB");
perm("unit", "hold", "create", "Hold a unit", G_UNIT, "BUTTON", "The hold expires by itself unless an extension is approved.");
perm("unit", "hold", "extend", "Approve a hold extension", G_UNIT, "BUTTON");
perm("unit", "hold", "release", "Release a held unit", G_UNIT, "BUTTON");

crud({
  module: "unit",
  resource: "priceList",
  entity: "price list",
  group: G_UNIT,
  extra: [
    ["activate", "Activate a price list version", "BUTTON", "Rate revisions carry an effective date; past bookings keep their rate."],
  ],
});

// ===========================================================================
// MASTERS — every master gets the full CRUD + status + export set
// ===========================================================================

const MASTER_RESOURCES: Array<[resource: string, entity: string, group: string]> = [
  ["company", "company", "Masters · Organisation"],
  ["department", "department", "Masters · Organisation"],
  ["designation", "designation", "Masters · Organisation"],
  ["state", "state", "Masters · Geography"],
  ["city", "city", "Masters · Geography"],
  ["projectType", "project type", "Masters · Project"],
  ["unitType", "unit type", "Masters · Project"],
  ["amenity", "amenity", "Masters · Project"],
  ["documentType", "document type", "Masters · Project"],
  ["delayReason", "delay reason", "Masters · Project"],
  ["uom", "unit of measure", "Masters · Material"],
  ["itemCategory", "item category", "Masters · Material"],
  ["item", "material item", "Masters · Material"],
  ["taxRate", "tax rate", "Masters · Material"],
  ["vendor", "vendor", "Masters · Material"],
  ["paymentTerm", "payment term", "Masters · Material"],
  ["store", "store", "Masters · Material"],
  ["leadSource", "lead source", "Masters · Sales"],
  ["lostReason", "lost reason", "Masters · Sales"],
  ["chargeHead", "charge head", "Masters · Sales"],
  ["bank", "bank", "Masters · Sales"],
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

// ===========================================================================
// ADMINISTRATION — users, roles, permissions, limits, audit
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
    ["assignProjects", "Map a user to projects", "BUTTON"],
    ["assignPermissions", "Grant or deny individual permissions on a user", "BUTTON", "Per-user overrides sit on top of role grants. DENY always wins."],
    ["revokeSessions", "Sign a user out of every device", "BUTTON"],
    ["tabRoles", "User tab — Roles", "TAB"],
    ["tabPermissions", "User tab — Direct permissions", "TAB"],
    ["tabProjects", "User tab — Project access", "TAB"],
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

crud({
  module: "admin",
  resource: "approvalLimit",
  entity: "approval value limit",
  group: G_ADMIN_ACCESS,
  extra: [],
});

perm("admin", "audit", "view", "Audit trail", G_ADMIN_SYS, "PAGE", "Every create, edit, approve and delete on the platform.");
perm("admin", "audit", "export", "Export audit trail", G_ADMIN_SYS, "BUTTON");
perm("admin", "session", "view", "Active sessions", G_ADMIN_SYS, "PAGE");
perm("admin", "session", "revoke", "Revoke a session", G_ADMIN_SYS, "BUTTON");
perm("admin", "settings", "view", "Platform settings", G_ADMIN_SYS, "PAGE");
perm("admin", "settings", "update", "Change platform settings", G_ADMIN_SYS, "BUTTON");

// ===========================================================================
// REPORTS — each is a page plus its export
// ===========================================================================

const G_REP = "Reports";

const REPORTS: Array<[key: string, label: string]> = [
  ["budgetVsActual", "Budget vs actual"],
  ["scheduleVariance", "Schedule variance"],
  ["projectProgress", "Project progress summary"],
  ["consumptionVsIndent", "Consumption vs indent vs budget"],
  ["stockValuation", "Stock and valuation"],
  ["openPurchaseOrders", "Open purchase orders"],
  ["vendorOutstanding", "Vendor outstanding"],
  ["indentAgeing", "Indent ageing"],
  ["salesFunnel", "Sales funnel"],
  ["leadPerformance", "Lead source and executive performance"],
  ["collections", "Collections and outstanding"],
  ["unitAvailability", "Unit availability"],
  ["bookingRegister", "Booking register"],
];

for (const [key, label] of REPORTS) {
  perm("reports", key, "view", label, G_REP, "REPORT");
  perm("reports", key, "export", `Export — ${label}`, G_REP, "BUTTON");
}

// ===========================================================================
// PENDING MODULES — registered so roles can be pre-configured, but no UI yet.
// Task Management and Checklist Management await client verification.
// ===========================================================================

const G_PENDING = "Pending client verification";

crud({
  module: "task",
  resource: "task",
  entity: "task",
  group: G_PENDING,
  extra: [
    ["assign", "Assign a task", "BUTTON"],
    ["submit", "Submit a task for review", "BUTTON"],
    ["approve", "Approve a submitted task", "BUTTON"],
    ["reopen", "Reopen a task", "BUTTON"],
  ],
});

crud({
  module: "checklist",
  resource: "checklist",
  entity: "checklist",
  group: G_PENDING,
  extra: [
    ["execute", "Fill in a checklist at site", "BUTTON"],
    ["verify", "Verify a completed checklist", "BUTTON"],
  ],
});

crud({ module: "checklist", resource: "category", entity: "checklist category", group: G_PENDING });

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

/** Modules that are registered but deliberately not built yet. */
export const PENDING_MODULES = MODULES.filter((m) => m.pending).map((m) => m.key);

export function isPendingModule(moduleKey: string): boolean {
  return PENDING_MODULES.includes(moduleKey);
}
