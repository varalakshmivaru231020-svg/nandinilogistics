/**
 * Master reference data — states, cities, departments, designations, project
 * and unit types, UOMs, item categories, tax rates, items, payment terms,
 * vendors, lead sources, lost and delay reasons, amenities, charge heads,
 * document types, banks and the numbering series.
 *
 *   pnpm seed:reference
 *
 * Kept apart from the seed so it can be applied to a deployed environment,
 * where the full seed cannot run — that would reset user passwords and the demo
 * project. Every write is an upsert keyed on the row's code, so renaming a
 * master here renames it in place and anything already pointing at it keeps its
 * link.
 */
import type { PrismaClient } from "@prisma/client";

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

/** The design's four project types, in its order. Mixed Use is kept — the
 *  design does not draw it, but it is a real type and removing it would
 *  orphan any project already using it. */
const PROJECT_TYPES = [
  { code: "APT", name: "Apartment" },
  { code: "VILLA", name: "Villa" },
  { code: "PLOT", name: "Plot" },
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

export const NUMBERING = [
  { documentKey: "INDENT", prefix: "IND", padding: 4 },
  { documentKey: "PO", prefix: "PO", padding: 4 },
  { documentKey: "GRN", prefix: "GRN", padding: 4 },
  { documentKey: "INVOICE", prefix: "INV", padding: 4 },
  { documentKey: "ISSUE", prefix: "ISS", padding: 4 },
  { documentKey: "RETURN", prefix: "RET", padding: 4 },
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

/**
 * Number series introduced after projects already existed. For each project
 * that numbers the document a new series follows, create the new series in the
 * same pattern — so a live project's material returns read "RET/NNS/2026-27/0001"
 * rather than falling back to a timestamp. Idempotent; run by the reference seed.
 */
const LATER_SERIES: Array<{ documentKey: string; alongside: string; prefix: string; replaces: string }> = [
  { documentKey: "RETURN", alongside: "ISSUE", prefix: "RET", replaces: "ISS" },
];

export async function ensureLaterNumberingSeries(prisma: PrismaClient) {
  let created = 0;
  for (const later of LATER_SERIES) {
    const models = await prisma.numberingSeries.findMany({ where: { documentKey: later.alongside } });
    for (const m of models) {
      const exists = await prisma.numberingSeries.findFirst({
        where: { documentKey: later.documentKey, projectId: m.projectId, fiscalYear: m.fiscalYear },
      });
      if (exists) continue;
      await prisma.numberingSeries.create({
        data: {
          documentKey: later.documentKey,
          projectId: m.projectId,
          prefix: m.prefix.startsWith(later.replaces) ? later.prefix + m.prefix.slice(later.replaces.length) : later.prefix,
          fiscalYear: m.fiscalYear,
          padding: m.padding,
        },
      });
      created += 1;
    }
  }
  return created;
}
