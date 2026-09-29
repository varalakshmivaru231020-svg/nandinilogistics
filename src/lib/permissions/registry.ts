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
  { key: "approvals", label: "Approvals", sortOrder: 15 },
  { key: "project", label: "Project Management", sortOrder: 20 },
  { key: "task", label: "Task Management", sortOrder: 30 },
  { key: "checklist", label: "Checklist Management", sortOrder: 40 },
  { key: "schedule", label: "Project Schedule", sortOrder: 50 },
  { key: "material", label: "Material & Inventory", sortOrder: 60 },
  { key: "sales", label: "Lead Management & Sales CRM", sortOrder: 70 },
  { key: "unit", label: "Available Flats", sortOrder: 80 },
  { key: "hr", label: "Workforce — Users & Attendance", sortOrder: 85 },
  { key: "kb", label: "Knowledge Base", sortOrder: 88 },
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
const G_APPROVALS = "Approvals";

perm("dashboard", "owner", "view", "Owner dashboard", G_DASH, "PAGE", "Portfolio view, budget vs actual, sales funnel, collections, pending approvals.");
perm("dashboard", "projectManager", "view", "Project Manager dashboard", G_DASH, "PAGE", "Schedule variance, consumption vs budget, approvals waiting on me.");
perm("dashboard", "supervisor", "view", "Supervisor dashboard", G_DASH, "PAGE", "My indents, material issued to me, today's site log.");
perm("dashboard", "storeManager", "view", "Store Manager dashboard", G_DASH, "PAGE", "Stock and valuation, reorder alerts, open POs, vendor outstanding.");
perm("dashboard", "sales", "view", "Sales dashboard", G_DASH, "PAGE", "Leads by stage, follow-ups due, available units, bookings and collections.");
perm("dashboard", "widget", "viewFinancials", "See money figures on dashboards", G_DASH, "FIELD", "Hides every amount, budget and valuation tile when not granted.");

// Every approval in one place. The screen shows only what the viewer already
// has the permission to decide, so this grants sight of the queue, never the
// power to act on anything in it.
perm("approvals", "queue", "view", "Approvals queue", G_APPROVALS, "PAGE", "Everything waiting on you — indents, purchase orders, extensions, invoices, returns, transfers — with filter and search.");

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
perm("schedule", "extension", "view", "See extension requests", G_SCHED, "TAB");
perm("schedule", "extension", "request", "Request a date extension", G_SCHED, "BUTTON", "The site asks; the Project Manager decides. The baseline never moves.");
perm("schedule", "extension", "approve", "Decide an extension request as Project Manager", G_SCHED, "BUTTON", "The first of two decisions; the Admin grants the revised date.");
perm("schedule", "extension", "approveAdmin", "Grant or refuse the revised date as Admin", G_SCHED, "BUTTON", "The Admin also records whether the delay was genuine or avoidable.");
perm("schedule", "report", "view", "Schedule reports tab", G_SCHED, "TAB");
perm("schedule", "activity", "start", "Mark an activity started", G_SCHED, "BUTTON", "Stamps the actual start. The one-click form of updating progress.");
perm("schedule", "activity", "complete", "Mark an activity completed", G_SCHED, "BUTTON", "Stamps the actual finish at 100%.");

perm("schedule", "template", "apply", "Start a schedule from a template", G_SCHED, "BUTTON");
perm("schedule", "template", "save", "Save a schedule as a template", G_SCHED, "BUTTON");
perm("schedule", "template", "view", "See schedule templates", G_SCHED, "TAB");
perm("schedule", "template", "delete", "Delete a schedule template", G_SCHED, "BUTTON", "Removes the template only; schedules already built from it are untouched.");

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
    ["approvePm", "Approve a purchase order — PM level", "BUTTON", "The first of the design's two levels."],
    ["approveAdmin", "Approve a purchase order — Admin level", "BUTTON", "The second level. Above it the order is live."],
    ["revise", "Revise an approved purchase order", "BUTTON", "Raises the revision and sends it back through both approvals."],
    ["cancel", "Cancel purchase order", "BUTTON"],
    ["close", "Close purchase order", "BUTTON"],
    ["print", "Print purchase order", "BUTTON"],
    ["viewRate", "See purchase rates and PO values", "FIELD"],
    ["tabItems", "PO tab — Items", "TAB"],
    ["tabReceipts", "PO tab — Goods receipts", "TAB"],
    ["tabInvoices", "PO tab — Invoices", "TAB"],
  ],
});

perm("material", "vendor", "view", "Vendor directory", G_MAT_PO, "PAGE", "The performance view; the vendor master itself stays under Masters.");
perm("material", "vendor", "viewPerformance", "See vendor rating and on-time delivery", G_MAT_PO, "FIELD", "Both are derived from goods-receipt history.");
perm("material", "vendor", "manageCategories", "Set what a vendor supplies", G_MAT_PO, "BUTTON");

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
    ["cancel", "Cancel material issue", "BUTTON", "Puts back into the store whatever the issue still has out on site, at the rate it left. Not possible once a return is pending."],
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
    ["tabTimeline", "Lead tab — Timeline", "TAB"],
    ["tabFollowUps", "Lead tab — Follow-ups", "TAB"],
    ["tabNotes", "Lead tab — Notes", "TAB"],
    ["tabStageHistory", "Lead tab — Stage history", "TAB"],
    ["tabFiles", "Lead tab — Files", "TAB"],
    ["tabFlats", "Lead tab — Flats", "TAB", "Blocking or releasing a unit here moves the Available Flats board."],
    ["tabVisits", "Lead tab — Site visits", "TAB"],
    ["tabCostSheets", "Lead tab — Cost sheets", "TAB"],
    ["note", "Add a note to a lead", "BUTTON"],
    ["uploadFile", "Attach a file to a lead", "BUTTON", "KYC documents and brochures."],
    ["sendMail", "Send mail to a lead", "BUTTON"],
  ],
});

crud({ module: "sales", resource: "followUp", entity: "follow-up", group: G_SALES_LEAD, exportable: false });

// Duties rather than access: who is handed new leads, and who is told when a
// follow-up lapses. Resolved without the super-admin bypass, so administering
// the system never quietly makes someone the recipient of the work.
perm("sales", "lead", "receiveAssignment", "Receive auto-assigned leads", G_SALES_LEAD, "ACTION", "In round-robin or project-wise mode, new leads are shared among everyone holding this.");
perm("sales", "followUp", "receiveEscalation", "Receive overdue follow-up escalations", G_SALES_LEAD, "ACTION", "Notified when a lead's follow-up stays overdue past the grace period.");

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
  extra: [
    ["print", "Print receipt", "BUTTON"],
    ["clear", "Mark cheque cleared or bounced", "BUTTON", "Confirms a cheque or DD with the bank, or records it bounced — which takes the amount back off the booking."],
  ],
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
  ["leadField", "lead form field", "Masters · Sales"],
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
/* ------------------------- Workforce · Knowledge base ---------------------- */

const G_HR = "Workforce · Users & Attendance";
const G_KB = "Knowledge Base";

crud({
  module: "hr",
  resource: "employee",
  entity: "employee",
  group: G_HR,
  extra: [
    ["viewIdentity", "See Aadhaar and PAN", "FIELD", "Identity numbers are masked without it."],
    ["uploadDocument", "Attach an employee document", "BUTTON"],
    ["tabStaff", "Workforce tab — Employees", "TAB"],
  ],
});

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

crud({
  module: "kb",
  resource: "article",
  entity: "knowledge base article",
  group: G_KB,
  extra: [
    ["publish", "Publish or unpublish an article", "BUTTON"],
    ["attach", "Attach a file to an article", "BUTTON"],
  ],
});

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
  "admin.approvalLimit.export",
  "admin.approvalLimit.update",
  "admin.permission.sync",
  "admin.user.delete",
  "admin.user.revokeSessions",
  "checklist.category.export",
  "checklist.category.view",
  "checklist.checklist.execute",
  "checklist.checklist.export",
  "checklist.checklist.verify",
  "hr.employee.uploadDocument",
  "hr.employmentType.update",
  "hr.employmentType.view",
  "kb.article.export",
  "masters.leadField.export",
  "masters.leadField.import",
  "masters.leadField.toggleStatus",
  "masters.leadField.view",
  "material.grn.print",
  "material.indent.tabLinkedPo",
  "material.issue.delete",
  "material.issue.update",
  "material.purchaseOrder.tabInvoices",
  "material.purchaseOrder.tabItems",
  "material.purchaseOrder.tabReceipts",
  "material.return.update",
  "material.stock.adjust",
  "material.stock.audit",
  "material.stock.viewLedger",
  "material.transfer.delete",
  "material.transfer.update",
  "material.vendor.manageCategories",
  "material.vendorInvoice.delete",
  "material.vendorInvoice.update",
  "material.vendorPayment.delete",
  "project.block.create",
  "project.block.delete",
  "project.block.update",
  "project.block.view",
  "project.document.update",
  "project.document.view",
  "project.phase.view",
  "project.progressLog.update",
  "project.project.changeStatus",
  "project.project.delete",
  "project.project.tabFinancials",
  "project.project.tabSchedule",
  "project.project.tabUnits",
  "project.project.toggleStatus",
  "project.team.view",
  "project.workPackage.view",
  "sales.booking.confirm",
  "sales.booking.update",
  "sales.costSheet.delete",
  "sales.costSheet.update",
  "sales.customer.delete",
  "sales.customer.update",
  "sales.demand.create",
  "sales.demand.delete",
  "sales.demand.export",
  "sales.demand.update",
  "sales.followUp.delete",
  "sales.followUp.update",
  "sales.lead.delete",
  "sales.lead.merge",
  // The Send mail control was removed from the lead at the client's request.
  "sales.lead.sendMail",
  "sales.lead.tabCostSheets",
  "sales.lead.tabVisits",
  "sales.receipt.delete",
  "sales.siteVisit.delete",
  "sales.siteVisit.update",
  "schedule.activity.captureDelay",
  "schedule.activity.delete",
  "schedule.activity.update",
  "schedule.baseline.set",
  "schedule.gantt.view",
  "schedule.template.view",
  "task.task.export",
  "unit.hold.view",
  // The design's flats panel has no extension step: a hold is released or booked.
  "unit.hold.extend",
  "unit.priceList.delete",
  "unit.priceList.update",
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
