/**
 * Seeds the platform: permission catalogue, roles with their default access
 * matrix, master data, demo users and a demo project.
 *
 *   pnpm db:seed
 *
 * Idempotent — safe to re-run. Existing rows are updated, not duplicated.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/registry";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Nninfra@2026";

// ---------------------------------------------------------------------------
// Permission matching — rules use `*` as a segment wildcard.
//   "masters.*.view"        every master's view permission
//   "material.indent.*"     every indent action
//   "*"                     everything
// ---------------------------------------------------------------------------

function matches(code: string, rule: string): boolean {
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

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  level: number;
  grant: string[];
  deny?: string[];
}

const ROLES: RoleSeed[] = [
  {
    code: "OWNER_ADMIN",
    name: "Owner / Admin",
    description: "Sees everything, approves what matters, owns masters and users.",
    level: 10,
    grant: ["*"],
  },
  {
    code: "PROJECT_MANAGER",
    name: "Project Manager",
    description: "Runs the project end to end — structure, schedule, first-level approvals.",
    level: 20,
    grant: [
      "dashboard.projectManager.view",
      "dashboard.widget.viewFinancials",
      "project.*.*",
      "schedule.*.*",
      "material.indent.*",
      "material.purchaseOrder.view",
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
      "material.indent.approveAdmin",
      "material.indent.create",
    ],
  },
  {
    code: "SUPERVISOR",
    name: "Supervisor",
    description: "Executes and reports from site — raises indents, receives material, logs progress.",
    level: 30,
    grant: [
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
      "schedule.activity.view",
      "schedule.activity.updateProgress",
      "schedule.gantt.view",
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
      "dashboard.storeManager.view",
      "dashboard.widget.viewFinancials",
      "project.project.view",
      "material.indent.view",
      "material.indent.viewAll",
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
    deny: ["unit.unit.delete", "sales.customer.delete"],
  },
  {
    code: "SALES",
    name: "Sales Executive",
    description: "Owns lead to booking — follow-ups, site visits, cost sheets, collections.",
    level: 30,
    grant: [
      "dashboard.sales.view",
      "sales.lead.view",
      "sales.lead.create",
      "sales.lead.update",
      "sales.lead.changeStage",
      "sales.lead.markLost",
      "sales.lead.viewContact",
      "sales.lead.export",
      "sales.lead.tab*",
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
    deny: ["sales.costSheet.approveDiscount", "sales.booking.cancel"],
  },
];

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

const STATES = [
  { code: "KA", name: "Karnataka", gstCode: "29" },
  { code: "TG", name: "Telangana", gstCode: "36" },
  { code: "MH", name: "Maharashtra", gstCode: "27" },
  { code: "TN", name: "Tamil Nadu", gstCode: "33" },
];

const CITIES: Array<[string, string]> = [
  ["Bengaluru", "KA"],
  ["Mysuru", "KA"],
  ["Hyderabad", "TG"],
  ["Mumbai", "MH"],
  ["Pune", "MH"],
  ["Chennai", "TN"],
];

const DEPARTMENTS = [
  { code: "PROJ", name: "Projects" },
  { code: "PROC", name: "Procurement & Stores" },
  { code: "SALES", name: "Sales & Marketing" },
  { code: "ACC", name: "Accounts & Finance" },
  { code: "QC", name: "Quality & Safety" },
  { code: "ADMIN", name: "Administration" },
];

const DESIGNATIONS: Array<[string, string, string]> = [
  ["MD", "Managing Director", "ADMIN"],
  ["PM", "Project Manager", "PROJ"],
  ["SITE_ENG", "Site Engineer", "PROJ"],
  ["SUPV", "Site Supervisor", "PROJ"],
  ["STORE_MGR", "Store Manager", "PROC"],
  ["PURCH_EXE", "Purchase Executive", "PROC"],
  ["SALES_HEAD", "Sales Head", "SALES"],
  ["SALES_EXE", "Sales Executive", "SALES"],
  ["QC_ENG", "Quality Engineer", "QC"],
];

const PROJECT_TYPES = [
  { code: "APT", name: "Residential Apartment" },
  { code: "VILLA", name: "Villa Project" },
  { code: "PLOT", name: "Plotted Development" },
  { code: "COMM", name: "Commercial" },
  { code: "MIXED", name: "Mixed Use" },
];

const UNIT_TYPES = [
  { code: "1BHK", name: "1 BHK", bedrooms: 1, bathrooms: 1 },
  { code: "2BHK", name: "2 BHK", bedrooms: 2, bathrooms: 2 },
  { code: "2_5BHK", name: "2.5 BHK", bedrooms: 2, bathrooms: 2 },
  { code: "3BHK", name: "3 BHK", bedrooms: 3, bathrooms: 3 },
  { code: "4BHK", name: "4 BHK", bedrooms: 4, bathrooms: 4 },
  { code: "PH", name: "Penthouse", bedrooms: 4, bathrooms: 4 },
];

const UOMS = [
  { code: "NOS", name: "Numbers", precision: 0 },
  { code: "KG", name: "Kilogram", precision: 3 },
  { code: "MT", name: "Metric Tonne", precision: 3 },
  { code: "BAG", name: "Bag", precision: 0 },
  { code: "CUM", name: "Cubic Metre", precision: 3 },
  { code: "SQM", name: "Square Metre", precision: 2 },
  { code: "SQFT", name: "Square Feet", precision: 2 },
  { code: "LTR", name: "Litre", precision: 2 },
  { code: "RMT", name: "Running Metre", precision: 2 },
  { code: "BUNDLE", name: "Bundle", precision: 0 },
  { code: "ROLL", name: "Roll", precision: 0 },
];

const ITEM_CATEGORIES = [
  { code: "CEMENT", name: "Cement" },
  { code: "STEEL", name: "Steel & Reinforcement" },
  { code: "AGGR", name: "Sand & Aggregates" },
  { code: "BLOCKS", name: "Bricks & Blocks" },
  { code: "RMC", name: "Ready Mix Concrete" },
  { code: "ELEC", name: "Electrical" },
  { code: "PLUMB", name: "Plumbing & Sanitary" },
  { code: "FINISH", name: "Finishing & Paint" },
  { code: "HARDWARE", name: "Hardware & Fixtures" },
  { code: "WPROOF", name: "Waterproofing" },
  { code: "SAFETY", name: "Safety & PPE" },
  { code: "SHUTTER", name: "Shuttering & Scaffolding" },
];

const TAX_RATES = [
  { code: "GST0", name: "GST 0%", percentage: 0, cgst: 0, sgst: 0, igst: 0 },
  { code: "GST5", name: "GST 5%", percentage: 5, cgst: 2.5, sgst: 2.5, igst: 5 },
  { code: "GST12", name: "GST 12%", percentage: 12, cgst: 6, sgst: 6, igst: 12 },
  { code: "GST18", name: "GST 18%", percentage: 18, cgst: 9, sgst: 9, igst: 18 },
  { code: "GST28", name: "GST 28%", percentage: 28, cgst: 14, sgst: 14, igst: 28 },
];

/** [code, name, categoryCode, uomCode, hsn, taxCode, reorderLevel, rate] */
const ITEMS: Array<[string, string, string, string, string, string, number, number]> = [
  ["CEM-OPC53", "OPC 53 Grade Cement", "CEMENT", "BAG", "2523", "GST28", 500, 410],
  ["CEM-PPC", "PPC Cement", "CEMENT", "BAG", "2523", "GST28", 400, 385],
  ["STL-TMT8", "TMT Bar Fe500D — 8mm", "STEEL", "MT", "7214", "GST18", 5, 62000],
  ["STL-TMT10", "TMT Bar Fe500D — 10mm", "STEEL", "MT", "7214", "GST18", 5, 61500],
  ["STL-TMT12", "TMT Bar Fe500D — 12mm", "STEEL", "MT", "7214", "GST18", 8, 61000],
  ["STL-TMT16", "TMT Bar Fe500D — 16mm", "STEEL", "MT", "7214", "GST18", 8, 60800],
  ["STL-BIND", "Binding Wire 18 SWG", "STEEL", "KG", "7217", "GST18", 200, 78],
  ["AGG-MSAND", "M-Sand", "AGGR", "CUM", "2505", "GST5", 50, 1450],
  ["AGG-20MM", "20mm Coarse Aggregate", "AGGR", "CUM", "2517", "GST5", 40, 1250],
  ["AGG-12MM", "12mm Coarse Aggregate", "AGGR", "CUM", "2517", "GST5", 30, 1300],
  ["BLK-AAC200", "AAC Block 600x200x200", "BLOCKS", "NOS", "6810", "GST12", 1000, 62],
  ["BLK-SOLID", "Solid Concrete Block 8 inch", "BLOCKS", "NOS", "6810", "GST12", 800, 45],
  ["RMC-M25", "RMC M25 Grade", "RMC", "CUM", "3824", "GST18", 0, 5200],
  ["RMC-M30", "RMC M30 Grade", "RMC", "CUM", "3824", "GST18", 0, 5600],
  ["ELE-WIRE25", "PVC Copper Wire 2.5 sq.mm", "ELEC", "ROLL", "8544", "GST18", 30, 2150],
  ["ELE-CONDUIT", "PVC Conduit Pipe 25mm", "ELEC", "RMT", "3917", "GST18", 500, 42],
  ["PLB-CPVC20", "CPVC Pipe 20mm", "PLUMB", "RMT", "3917", "GST18", 300, 95],
  ["PLB-PVC110", "PVC Drainage Pipe 110mm", "PLUMB", "RMT", "3917", "GST18", 200, 245],
  ["FIN-PUTTY", "Wall Putty", "FINISH", "BAG", "3214", "GST18", 100, 720],
  ["FIN-PRIMER", "Cement Primer", "FINISH", "LTR", "3209", "GST18", 200, 185],
  ["FIN-EMULS", "Interior Emulsion Paint", "FINISH", "LTR", "3209", "GST18", 150, 265],
  ["WPF-MEMB", "APP Waterproofing Membrane", "WPROOF", "SQM", "6807", "GST18", 100, 340],
  ["SAF-HELMET", "Safety Helmet", "SAFETY", "NOS", "6506", "GST18", 50, 320],
  ["SAF-HARNESS", "Full Body Safety Harness", "SAFETY", "NOS", "6307", "GST18", 20, 1850],
  ["SHT-PLY12", "Shuttering Plywood 12mm", "SHUTTER", "NOS", "4412", "GST18", 60, 1450],
  ["SHT-PROP", "Adjustable Steel Prop", "SHUTTER", "NOS", "7308", "GST18", 100, 890],
];

const PAYMENT_TERMS = [
  { code: "ADV", name: "100% Advance", days: 0 },
  { code: "NET15", name: "Net 15 Days", days: 15 },
  { code: "NET30", name: "Net 30 Days", days: 30 },
  { code: "NET45", name: "Net 45 Days", days: 45 },
  { code: "NET60", name: "Net 60 Days", days: 60 },
];

const VENDORS: Array<[string, string, string, string, string]> = [
  ["V-UCEM", "Ultra Cement Distributors", "Ramesh Kumar", "9845012301", "29AABCU9603R1ZX"],
  ["V-SRSTL", "SR Steel & Alloys", "Prakash Jain", "9845012302", "29AACCS1234K1Z5"],
  ["V-BSAND", "Bengaluru Sand Suppliers", "Manjunath H", "9845012303", "29AAECB4567L1Z2"],
  ["V-APEXE", "Apex Electricals", "Faizal Ahmed", "9845012304", "29AAFCA7788M1Z9"],
  ["V-RMCPL", "Ready Mix Concrete Pvt Ltd", "Suresh Rao", "9845012305", "29AAGCR2211N1Z4"],
  ["V-BLDMT", "BuildMart Hardware", "Nandini S", "9845012306", "29AAHCB3344P1Z7"],
];

const LEAD_SOURCES = [
  { code: "WEB", name: "Website", isDigital: true },
  { code: "99ACRES", name: "99acres", isDigital: true },
  { code: "MAGIC", name: "MagicBricks", isDigital: true },
  { code: "HOUSING", name: "Housing.com", isDigital: true },
  { code: "FB", name: "Facebook Lead Form", isDigital: true },
  { code: "INSTA", name: "Instagram", isDigital: true },
  { code: "WALKIN", name: "Walk-in", isDigital: false },
  { code: "REF", name: "Referral", isDigital: false },
  { code: "CALL", name: "Inbound Call", isDigital: false },
  { code: "BROKER", name: "Channel Partner", isDigital: false },
];

const LOST_REASONS = [
  { code: "BUDGET", name: "Budget mismatch" },
  { code: "LOCATION", name: "Location not suitable" },
  { code: "COMPETITOR", name: "Bought from competitor" },
  { code: "NORESP", name: "Not responding" },
  { code: "POSTPONED", name: "Purchase postponed" },
  { code: "LOAN", name: "Home loan rejected" },
  { code: "POSSESSION", name: "Possession timeline too long" },
];

const DELAY_REASONS = [
  { code: "RAIN", name: "Rain / weather" },
  { code: "LABOUR", name: "Labour shortage" },
  { code: "MATERIAL", name: "Material not available" },
  { code: "DRAWING", name: "Drawing revision" },
  { code: "APPROVAL", name: "Statutory approval pending" },
  { code: "CLIENT", name: "Client hold" },
  { code: "FUNDS", name: "Fund release delay" },
];

const AMENITIES = [
  { code: "CLUB", name: "Clubhouse" },
  { code: "GYM", name: "Gymnasium" },
  { code: "POOL", name: "Swimming Pool" },
  { code: "PLAY", name: "Children's Play Area" },
  { code: "GARDEN", name: "Landscaped Garden" },
  { code: "POWER", name: "Power Backup" },
  { code: "LIFT", name: "Lifts" },
  { code: "SEC", name: "24x7 Security" },
  { code: "PARK", name: "Covered Parking" },
  { code: "RWH", name: "Rainwater Harvesting" },
];

/** [code, name, calcType, defaultValue, taxCode|null, sortOrder, mandatory] */
const CHARGE_HEADS: Array<[string, string, string, number, string | null, number, boolean]> = [
  ["BASE", "Base Price", "PER_SQFT", 0, "GST5", 10, true],
  ["FLOORRISE", "Floor Rise Charges", "PER_SQFT", 25, "GST5", 20, false],
  ["PLC", "Preferential Location Charges", "FIXED", 150000, "GST5", 30, false],
  ["PARKING", "Car Parking", "FIXED", 350000, "GST18", 40, false],
  ["CLUB", "Club Membership", "FIXED", 125000, "GST18", 50, false],
  ["MAINT", "Maintenance Deposit (12 months)", "FIXED", 60000, "GST18", 60, false],
  ["CORPUS", "Corpus Fund", "FIXED", 50000, null, 70, false],
  ["LEGAL", "Legal & Documentation", "FIXED", 25000, "GST18", 80, false],
  ["STAMP", "Stamp Duty & Registration", "PERCENT_OF_BASE", 6.5, null, 90, true],
];

const DOCUMENT_TYPES = [
  { code: "RERA", name: "RERA Certificate", scope: "project", requiresExpiry: true },
  { code: "PLAN", name: "Approved Building Plan", scope: "project", requiresExpiry: false },
  { code: "LICENCE", name: "Commencement Licence", scope: "project", requiresExpiry: true },
  { code: "STRUCT", name: "Structural Drawing", scope: "project", requiresExpiry: false },
  { code: "ARCH", name: "Architectural Drawing", scope: "project", requiresExpiry: false },
  { code: "NOC", name: "NOC / Clearance", scope: "project", requiresExpiry: true },
  { code: "AGREE", name: "Sale Agreement", scope: "sales", requiresExpiry: false },
  { code: "KYC", name: "Customer KYC", scope: "sales", requiresExpiry: false },
];

const BANKS = [
  { code: "HDFC", name: "HDFC Bank", branch: "Koramangala" },
  { code: "ICICI", name: "ICICI Bank", branch: "Indiranagar" },
  { code: "SBI", name: "State Bank of India", branch: "MG Road" },
];

const NUMBERING = [
  { documentKey: "INDENT", prefix: "IND", padding: 4 },
  { documentKey: "PO", prefix: "PO", padding: 4 },
  { documentKey: "GRN", prefix: "GRN", padding: 4 },
  { documentKey: "INVOICE", prefix: "INV", padding: 4 },
  { documentKey: "ISSUE", prefix: "ISS", padding: 4 },
  { documentKey: "TRANSFER", prefix: "TRF", padding: 4 },
  { documentKey: "LEAD", prefix: "LD", padding: 5 },
  { documentKey: "BOOKING", prefix: "BKG", padding: 4 },
  { documentKey: "RECEIPT", prefix: "RCT", padding: 5 },
  { documentKey: "DEMAND", prefix: "DMD", padding: 5 },
  { documentKey: "COSTSHEET", prefix: "CS", padding: 5 },
  { documentKey: "CUSTOMER", prefix: "CUST", padding: 5 },
  { documentKey: "PAYMENT", prefix: "PAY", padding: 5 },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function seedPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: p.module,
        resource: p.resource,
        action: p.action,
        label: p.label,
        description: p.description ?? null,
        group: p.group,
        kind: p.kind,
      },
      update: {
        module: p.module,
        resource: p.resource,
        action: p.action,
        label: p.label,
        description: p.description ?? null,
        group: p.group,
        kind: p.kind,
      },
    });
  }
  console.log(`  permissions: ${PERMISSIONS.length}`);
}

async function seedRoles() {
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

async function seedMasters() {
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

  for (const t of PROJECT_TYPES) {
    await prisma.projectType.upsert({ where: { code: t.code }, create: t, update: t });
  }
  for (const t of UNIT_TYPES) {
    await prisma.unitType.upsert({ where: { code: t.code }, create: t, update: t });
  }
  for (const u of UOMS) {
    await prisma.uom.upsert({ where: { code: u.code }, create: u, update: u });
  }
  for (const c of ITEM_CATEGORIES) {
    await prisma.itemCategory.upsert({ where: { code: c.code }, create: c, update: c });
  }
  for (const t of TAX_RATES) {
    await prisma.taxRate.upsert({ where: { code: t.code }, create: t, update: t });
  }
  for (const t of PAYMENT_TERMS) {
    await prisma.paymentTerm.upsert({ where: { code: t.code }, create: t, update: t });
  }

  const catIds = new Map((await prisma.itemCategory.findMany()).map((c) => [c.code, c.id]));
  const uomIds = new Map((await prisma.uom.findMany()).map((u) => [u.code, u.id]));
  const taxIds = new Map((await prisma.taxRate.findMany()).map((t) => [t.code, t.id]));

  for (const [code, name, cat, uom, hsn, tax, reorder, rate] of ITEMS) {
    const data = {
      code,
      name,
      categoryId: catIds.get(cat)!,
      uomId: uomIds.get(uom)!,
      hsnCode: hsn,
      taxRateId: taxIds.get(tax) ?? null,
      reorderLevel: reorder,
      standardRate: rate,
    };
    await prisma.item.upsert({ where: { code }, create: data, update: data });
  }

  const termIds = new Map((await prisma.paymentTerm.findMany()).map((t) => [t.code, t.id]));
  for (const [code, name, contact, phone, gstin] of VENDORS) {
    const data = {
      code,
      name,
      contactPerson: contact,
      phone,
      gstin,
      cityId: cityIds.get("Bengaluru") ?? null,
      paymentTermId: termIds.get("NET30") ?? null,
      rating: 4,
    };
    await prisma.vendor.upsert({ where: { code }, create: data, update: data });
  }

  for (const s of LEAD_SOURCES) {
    await prisma.leadSource.upsert({ where: { code: s.code }, create: s, update: s });
  }
  for (const r of LOST_REASONS) {
    await prisma.lostReason.upsert({ where: { code: r.code }, create: r, update: r });
  }
  for (const r of DELAY_REASONS) {
    await prisma.delayReason.upsert({ where: { code: r.code }, create: r, update: r });
  }
  for (const a of AMENITIES) {
    await prisma.amenity.upsert({ where: { code: a.code }, create: a, update: a });
  }
  for (const [code, name, calcType, defaultValue, taxCode, sortOrder, isMandatory] of CHARGE_HEADS) {
    const data = {
      code,
      name,
      calcType,
      defaultValue,
      taxRateId: taxCode ? (taxIds.get(taxCode) ?? null) : null,
      sortOrder,
      isMandatory,
    };
    await prisma.chargeHead.upsert({ where: { code }, create: data, update: data });
  }
  for (const d of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({ where: { code: d.code }, create: d, update: d });
  }
  for (const b of BANKS) {
    await prisma.bank.upsert({ where: { code: b.code }, create: b, update: b });
  }

  await prisma.company.upsert({
    where: { code: "NNID" },
    create: {
      code: "NNID",
      name: "NN Infrastructure Developers",
      legalName: "NN Infrastructure Developers Pvt. Ltd.",
      cityId: cityIds.get("Bengaluru") ?? null,
      gstin: "29AABCN1234M1ZP",
      pan: "AABCN1234M",
      email: "info@nninfra.example",
      phone: "080-40001234",
      addressLine: "No. 42, 3rd Floor, Residency Road",
      pincode: "560025",
    },
    update: {},
  });

  console.log("  masters seeded");
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const roleIds = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const deptIds = new Map((await prisma.department.findMany()).map((d) => [d.code, d.id]));
  const desigIds = new Map((await prisma.designation.findMany()).map((d) => [d.code, d.id]));

  const users: Array<{
    employeeCode: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    dept: string;
    desig: string;
    isSuperAdmin?: boolean;
  }> = [
    { employeeCode: "NN-0001", name: "Narayan Nagaraj", email: "owner@nninfra.example", phone: "9845000001", role: "OWNER_ADMIN", dept: "ADMIN", desig: "MD", isSuperAdmin: true },
    { employeeCode: "NN-0002", name: "Anil Deshpande", email: "pm@nninfra.example", phone: "9845000002", role: "PROJECT_MANAGER", dept: "PROJ", desig: "PM" },
    { employeeCode: "NN-0003", name: "Ravi Shankar", email: "supervisor@nninfra.example", phone: "9845000003", role: "SUPERVISOR", dept: "PROJ", desig: "SUPV" },
    { employeeCode: "NN-0004", name: "Girish Patil", email: "store@nninfra.example", phone: "9845000004", role: "STORE_MANAGER", dept: "PROC", desig: "STORE_MGR" },
    { employeeCode: "NN-0005", name: "Meera Krishnan", email: "saleshead@nninfra.example", phone: "9845000005", role: "SALES_HEAD", dept: "SALES", desig: "SALES_HEAD" },
    { employeeCode: "NN-0006", name: "Deepak Rao", email: "sales@nninfra.example", phone: "9845000006", role: "SALES", dept: "SALES", desig: "SALES_EXE" },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        employeeCode: u.employeeCode,
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash,
        isSuperAdmin: u.isSuperAdmin ?? false,
        departmentId: deptIds.get(u.dept) ?? null,
        designationId: desigIds.get(u.desig) ?? null,
      },
      update: {
        name: u.name,
        phone: u.phone,
        departmentId: deptIds.get(u.dept) ?? null,
        designationId: desigIds.get(u.desig) ?? null,
      },
    });
    const roleId = roleIds.get(u.role);
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        create: { userId: user.id, roleId },
        update: {},
      });
    }
  }
  console.log(`  users: ${users.length} (password for all: ${DEMO_PASSWORD})`);
}

async function seedApprovalLimits() {
  const roleIds = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const limits: Array<[string, string, number]> = [
    // scope, roleCode, ceiling — an indent above the PM ceiling must go to Admin.
    ["material.indent", "PROJECT_MANAGER", 500000],
    ["material.indent", "OWNER_ADMIN", 100000000],
    ["material.po", "STORE_MANAGER", 200000],
    ["material.po", "PROJECT_MANAGER", 1000000],
    ["material.po", "OWNER_ADMIN", 100000000],
    ["sales.discount", "SALES_HEAD", 200000],
    ["sales.discount", "OWNER_ADMIN", 100000000],
  ];
  for (const [scope, roleCode, maxValue] of limits) {
    const roleId = roleIds.get(roleCode);
    if (!roleId) continue;
    const existing = await prisma.approvalLimit.findFirst({ where: { scope, roleId } });
    if (existing) {
      await prisma.approvalLimit.update({ where: { id: existing.id }, data: { maxValue } });
    } else {
      await prisma.approvalLimit.create({ data: { scope, roleId, maxValue } });
    }
  }
  console.log(`  approval limits: ${limits.length}`);
}

async function seedDemoProject() {
  const typeIds = new Map((await prisma.projectType.findMany()).map((t) => [t.code, t.id]));
  const cityIds = new Map((await prisma.city.findMany()).map((c) => [c.name, c.id]));
  const company = await prisma.company.findUnique({ where: { code: "NNID" } });
  const pm = await prisma.user.findUnique({ where: { email: "pm@nninfra.example" } });

  const project = await prisma.project.upsert({
    where: { code: "NNS" },
    create: {
      code: "NNS",
      name: "NN Skyline",
      companyId: company?.id ?? null,
      projectTypeId: typeIds.get("APT")!,
      cityId: cityIds.get("Bengaluru") ?? null,
      addressLine: "Sarjapur Road, Bengaluru",
      reraNumber: "PRM/KA/RERA/1251/446/PR/260830/001234",
      landArea: 218000,
      totalTowers: 2,
      totalFloors: 14,
      budgetAmount: 1850000000,
      startDate: new Date("2026-01-15"),
      targetDate: new Date("2028-06-30"),
      projectManagerId: pm?.id ?? null,
      status: "ACTIVE",
      description: "Two-tower residential development, 2 & 3 BHK, Sarjapur Road.",
    },
    update: {},
  });

  // Every non-super user is mapped to the demo project so the scoping is visible.
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) {
    await prisma.userProject.upsert({
      where: { userId_projectId: { userId: u.id, projectId: project.id } },
      create: { userId: u.id, projectId: project.id },
      update: {},
    });
  }

  // Work breakdown: Project -> Phase -> Work Package
  const phases: Array<[string, string, number, Array<[string, string]>]> = [
    ["PH-FND", "Foundation & Substructure", 1, [["WP-EXC", "Excavation & PCC"], ["WP-RAFT", "Raft & Footings"]]],
    ["PH-STRA", "Tower A — Structure", 2, [["WP-COLA", "Columns & Slabs 1–7"], ["WP-COLA2", "Columns & Slabs 8–14"]]],
    ["PH-STRB", "Tower B — Structure", 3, [["WP-COLB", "Columns & Slabs 1–7"], ["WP-COLB2", "Columns & Slabs 8–14"]]],
    ["PH-FIN", "Finishing", 4, [["WP-BLK", "Blockwork & Plastering"], ["WP-PNT", "Painting & Flooring"]]],
    ["PH-MEP", "MEP & External", 5, [["WP-ELE", "Electrical & Plumbing"], ["WP-EXT", "External Development"]]],
  ];

  for (const [code, name, sequence, packages] of phases) {
    const phase = await prisma.projectPhase.upsert({
      where: { projectId_code: { projectId: project.id, code } },
      create: { projectId: project.id, code, name, sequence },
      update: { name, sequence },
    });
    let wpSeq = 1;
    for (const [wpCode, wpName] of packages) {
      await prisma.workPackage.upsert({
        where: { phaseId_code: { phaseId: phase.id, code: wpCode } },
        create: { phaseId: phase.id, code: wpCode, name: wpName, sequence: wpSeq++ },
        update: { name: wpName },
      });
    }
  }

  // Blocks, floors and units — the availability board.
  const unitTypeIds = new Map((await prisma.unitType.findMany()).map((t) => [t.code, t.id]));
  const blocks: Array<[string, string, number]> = [
    ["A", "Tower A", 14],
    ["B", "Tower B", 14],
  ];
  const layout: Array<[string, string, number, number, number]> = [
    // suffix, unitType, carpet, builtUp, superBuiltUp
    ["01", "2BHK", 845, 1010, 1245],
    ["02", "3BHK", 1120, 1340, 1655],
    ["03", "2BHK", 860, 1030, 1270],
    ["04", "3BHK", 1180, 1410, 1740],
  ];

  for (const [blockCode, blockName, floors] of blocks) {
    const block = await prisma.block.upsert({
      where: { projectId_code: { projectId: project.id, code: blockCode } },
      create: { projectId: project.id, code: blockCode, name: blockName, totalFloors: floors },
      update: { name: blockName, totalFloors: floors },
    });

    for (let floor = 1; floor <= floors; floor++) {
      for (const [suffix, typeCode, carpet, builtUp, sba] of layout) {
        const unitNumber = `${blockCode}-${String(floor).padStart(2, "0")}${suffix}`;
        // A deterministic spread of statuses so the board is not uniformly green.
        const seed = (floor * 7 + Number(suffix) * 3 + blockCode.charCodeAt(0)) % 11;
        const status =
          seed === 0 ? "BOOKED" : seed === 1 ? "HELD" : seed === 2 ? "AGREEMENT" : seed === 3 ? "REGISTERED" : "AVAILABLE";

        await prisma.unit.upsert({
          where: { projectId_unitNumber: { projectId: project.id, unitNumber } },
          create: {
            projectId: project.id,
            blockId: block.id,
            unitTypeId: unitTypeIds.get(typeCode) ?? null,
            unitNumber,
            floorNumber: floor,
            carpetArea: carpet,
            builtUpArea: builtUp,
            superBuiltUpArea: sba,
            facing: suffix === "01" || suffix === "03" ? "East" : "West",
            plcTag: suffix === "02" ? "CORNER" : null,
            parkingSlots: typeCode === "3BHK" ? 2 : 1,
            status: status as never,
          },
          update: {},
        });
      }
    }
  }

  const unitCount = await prisma.unit.count({ where: { projectId: project.id } });
  await prisma.project.update({ where: { id: project.id }, data: { totalUnits: unitCount } });

  // Project store
  await prisma.store.upsert({
    where: { code: "ST-NNS" },
    create: { code: "ST-NNS", name: "NN Skyline Site Store", projectId: project.id },
    update: {},
  });
  await prisma.store.upsert({
    where: { code: "ST-CENTRAL" },
    create: { code: "ST-CENTRAL", name: "Central Store — Bengaluru" },
    update: {},
  });

  // Active price list
  const existingPl = await prisma.priceList.findFirst({ where: { projectId: project.id, isActive: true } });
  if (!existingPl) {
    await prisma.priceList.create({
      data: {
        projectId: project.id,
        name: "Launch Price List 2026",
        version: 1,
        effectiveFrom: new Date("2026-02-01"),
        isActive: true,
        items: { create: [{ baseRate: 7450, floorRise: 25, plcAmount: 150000 }] },
      },
    });
  }

  // Numbering series, project-scoped
  for (const n of NUMBERING) {
    const existing = await prisma.numberingSeries.findFirst({
      where: { documentKey: n.documentKey, projectId: project.id },
    });
    if (!existing) {
      await prisma.numberingSeries.create({
        data: {
          documentKey: n.documentKey,
          projectId: project.id,
          prefix: `${n.prefix}/${project.code}`,
          padding: n.padding,
          fiscalYear: "2026-27",
        },
      });
    }
  }

  console.log(`  demo project: ${project.name} — ${unitCount} units`);
}

async function main() {
  console.log("\nSeeding NN Infra ERP\n");
  await seedPermissions();
  await seedRoles();
  await seedMasters();
  await seedUsers();
  await seedApprovalLimits();
  await seedDemoProject();
  console.log("\nSeed complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
