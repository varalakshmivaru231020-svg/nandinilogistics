/**
 * Demo transactional data — stock, indents mid-approval, leads in the pipeline.
 * Separate from the core seed so a production install never runs it.
 *
 *   pnpm db:demo
 */
import { PrismaClient } from "@prisma/client";
import { postGrnToStock } from "../src/lib/material/grn-posting";
import { threeWayMatch } from "../src/lib/inventory";
import { buildCostSheet, buildPaymentSchedule } from "../src/lib/sales/cost-sheet";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function daysAhead(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}

async function main() {
  console.log("\nSeeding demo transactions\n");

  const project = await prisma.project.findUnique({ where: { code: "NNS" } });
  const store = await prisma.store.findUnique({ where: { code: "ST-NNS" } });
  if (!project || !store) throw new Error("Run `pnpm db:seed` first.");

  const [supervisor, pm, owner, sales, salesHead, storeUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: "supervisor@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "pm@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "owner@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "sales@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "saleshead@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "store@nninfra.example" } }),
  ]);
  if (!supervisor || !pm || !owner || !sales || !salesHead || !storeUser) {
    throw new Error("Seeded users missing.");
  }

  const items = await prisma.item.findMany({ select: { id: true, code: true, standardRate: true, reorderLevel: true } });
  const itemBy = new Map(items.map((i) => [i.code, i]));

  /* ------------------------------ Stock on hand ----------------------------- */

  const stockLevels: Array<[string, number]> = [
    ["CEM-OPC53", 820],   // healthy
    ["STL-TMT12", 12.5],
    ["STL-TMT16", 3.2],   // below reorder level of 8 -> alert
    ["AGG-MSAND", 38],    // below reorder level of 50 -> alert
    ["BLK-AAC200", 2400],
    ["SHT-PLY12", 42],    // below reorder of 60 -> alert
    ["SAF-HELMET", 65],
    ["FIN-PUTTY", 140],
  ];

  for (const [code, quantity] of stockLevels) {
    const item = itemBy.get(code);
    if (!item) continue;
    const rate = Number(item.standardRate);

    await prisma.stockBalance.upsert({
      where: { itemId_storeId: { itemId: item.id, storeId: store.id } },
      create: {
        itemId: item.id, storeId: store.id, projectId: project.id,
        quantity, avgRate: rate, value: quantity * rate,
      },
      update: { quantity, avgRate: rate, value: quantity * rate },
    });

    const existingLedger = await prisma.stockLedger.findFirst({
      where: { itemId: item.id, storeId: store.id, refType: "OPENING" },
    });
    if (!existingLedger) {
      await prisma.stockLedger.create({
        data: {
          itemId: item.id, storeId: store.id, projectId: project.id,
          txnType: "ADJUSTMENT", txnDate: daysAgo(30),
          quantity, rate, value: quantity * rate, balanceQty: quantity,
          refType: "OPENING", refId: "opening-balance", refNo: "OPENING",
          remarks: "Opening stock", createdById: owner.id,
        },
      });
    }
  }
  console.log(`  stock balances: ${stockLevels.length}`);

  /* --------------------------------- Indents -------------------------------- */

  const workPackage = await prisma.workPackage.findFirst({
    where: { phase: { projectId: project.id } },
    orderBy: { sequence: "asc" },
  });

  type IndentSpec = {
    no: string;
    status: "DRAFT" | "SUBMITTED" | "PM_APPROVED" | "ADMIN_APPROVED";
    raisedDaysAgo: number;
    purpose: string;
    lines: Array<[code: string, requested: number, approved: number | null]>;
    approvals: Array<{ level: "PM" | "ADMIN"; by: string; remarks: string; daysAgo: number; changes?: Record<string, { from: number; to: number }> }>;
  };

  const specs: IndentSpec[] = [
    {
      no: "IND/NNS/2026-27/9001",
      status: "SUBMITTED",
      raisedDaysAgo: 5,
      purpose: "Slab casting — Tower A, 7th floor",
      lines: [["CEM-OPC53", 400, null], ["STL-TMT12", 6, null], ["AGG-MSAND", 45, null]],
      approvals: [],
    },
    {
      no: "IND/NNS/2026-27/9002",
      status: "PM_APPROVED",
      raisedDaysAgo: 9,
      purpose: "Blockwork — Tower B, floors 3 to 5",
      lines: [["BLK-AAC200", 3200, 3000], ["CEM-OPC53", 180, 180]],
      approvals: [
        {
          level: "PM", by: pm.id, daysAgo: 7,
          remarks: "Quantity trimmed to match the approved BOQ for these floors.",
          changes: { "qty:blocks": { from: 3200, to: 3000 } },
        },
      ],
    },
    {
      no: "IND/NNS/2026-27/9003",
      status: "ADMIN_APPROVED",
      raisedDaysAgo: 14,
      purpose: "Shuttering for 8th floor slab",
      lines: [["SHT-PLY12", 60, 60], ["SHT-PROP", 120, 120]],
      approvals: [
        { level: "PM", by: pm.id, daysAgo: 12, remarks: "Approved, matches the shuttering plan." },
        { level: "ADMIN", by: owner.id, daysAgo: 11, remarks: "Approved. Above the PM ceiling, so it came here." },
      ],
    },
    {
      no: "IND/NNS/2026-27/9004",
      status: "DRAFT",
      raisedDaysAgo: 1,
      purpose: "Safety gear replacement — site wide",
      lines: [["SAF-HELMET", 40, null], ["SAF-HARNESS", 12, null]],
      approvals: [],
    },
  ];

  for (const spec of specs) {
    const existing = await prisma.indent.findUnique({ where: { indentNo: spec.no } });
    if (existing) continue;

    const lines = spec.lines
      .map(([code, requested, approved]) => {
        const item = itemBy.get(code);
        if (!item) return null;
        const rate = Number(item.standardRate);
        return {
          itemId: item.id,
          requestedQty: requested,
          approvedQty: approved,
          toPurchaseQty: approved ?? 0,
          estimatedRate: rate,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    const value = lines.reduce((s, l) => s + (l.approvedQty ?? l.requestedQty) * l.estimatedRate, 0);

    const indent = await prisma.indent.create({
      data: {
        indentNo: spec.no,
        projectId: project.id,
        workPackageId: workPackage?.id ?? null,
        raisedById: supervisor.id,
        raisedAt: daysAgo(spec.raisedDaysAgo),
        requiredByDate: daysAhead(10 - spec.raisedDaysAgo),
        purpose: spec.purpose,
        estimatedValue: value,
        status: spec.status,
        items: { create: lines },
      },
    });

    for (const a of spec.approvals) {
      await prisma.indentApproval.create({
        data: {
          indentId: indent.id,
          level: a.level,
          decision: "APPROVED",
          approvedById: a.by,
          approvedAt: daysAgo(a.daysAgo),
          remarks: a.remarks,
          changes: a.changes ?? undefined,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: supervisor.id,
        action: "SUBMIT",
        entity: "Indent",
        entityId: indent.id,
        projectId: project.id,
        summary: `Raised indent ${spec.no} for ₹${value.toLocaleString("en-IN")}`,
        createdAt: daysAgo(spec.raisedDaysAgo),
      },
    });
  }
  console.log(`  indents: ${specs.length}`);

  /* ---------------------------------- Leads --------------------------------- */

  const sources = await prisma.leadSource.findMany();
  const sourceBy = new Map(sources.map((s) => [s.code, s.id]));
  const lostReason = await prisma.lostReason.findUnique({ where: { code: "BUDGET" } });

  const leadSpecs: Array<{
    no: string; name: string; phone: string; email: string; source: string;
    state: "NEW" | "CONTACTED" | "SITE_VISIT_SCHEDULED" | "VISIT_DONE" | "NEGOTIATION" | "BOOKED" | "LOST";
    owner: string; daysAgo: number; nextInDays: number | null; budgetMin: number; budgetMax: number;
  }> = [
    { no: "LD/00001", name: "Rajesh Iyer", phone: "9880012301", email: "rajesh.iyer@example.com", source: "99ACRES", state: "NEW", owner: sales.id, daysAgo: 1, nextInDays: 0, budgetMin: 8000000, budgetMax: 9500000 },
    { no: "LD/00002", name: "Priya Menon", phone: "9880012302", email: "priya.menon@example.com", source: "WEB", state: "CONTACTED", owner: sales.id, daysAgo: 4, nextInDays: -1, budgetMin: 9000000, budgetMax: 11000000 },
    { no: "LD/00003", name: "Arun Kumar", phone: "9880012303", email: "arun.k@example.com", source: "WALKIN", state: "SITE_VISIT_SCHEDULED", owner: sales.id, daysAgo: 6, nextInDays: 2, budgetMin: 7500000, budgetMax: 8500000 },
    { no: "LD/00004", name: "Sneha Reddy", phone: "9880012304", email: "sneha.r@example.com", source: "REF", state: "VISIT_DONE", owner: sales.id, daysAgo: 11, nextInDays: 1, budgetMin: 11000000, budgetMax: 13000000 },
    { no: "LD/00005", name: "Vikram Shetty", phone: "9880012305", email: "vikram.s@example.com", source: "MAGIC", state: "NEGOTIATION", owner: salesHead.id, daysAgo: 18, nextInDays: -2, budgetMin: 12000000, budgetMax: 14000000 },
    { no: "LD/00006", name: "Anita Desai", phone: "9880012306", email: "anita.d@example.com", source: "FB", state: "LOST", owner: sales.id, daysAgo: 25, nextInDays: null, budgetMin: 6000000, budgetMax: 7000000 },
    { no: "LD/00007", name: "Mohammed Faiz", phone: "9880012307", email: "m.faiz@example.com", source: "BROKER", state: "CONTACTED", owner: salesHead.id, daysAgo: 3, nextInDays: 3, budgetMin: 9500000, budgetMax: 10500000 },
  ];

  for (const l of leadSpecs) {
    const existing = await prisma.lead.findUnique({ where: { leadNo: l.no } });
    if (existing) continue;

    await prisma.lead.create({
      data: {
        leadNo: l.no,
        name: l.name,
        phone: l.phone,
        email: l.email,
        sourceId: sourceBy.get(l.source) ?? sources[0].id,
        projectId: project.id,
        ownerId: l.owner,
        state: l.state,
        budgetMin: l.budgetMin,
        budgetMax: l.budgetMax,
        requirement: "2–3 BHK, east facing preferred",
        assignedAt: daysAgo(l.daysAgo),
        firstResponseMins: 20 + Math.floor(Math.random() * 100),
        nextActionAt: l.nextInDays === null ? null : daysAhead(l.nextInDays),
        lostReasonId: l.state === "LOST" ? (lostReason?.id ?? null) : null,
        lostNotes: l.state === "LOST" ? "Budget did not stretch to the 3 BHK inventory available." : null,
        createdAt: daysAgo(l.daysAgo),
        followUps: {
          create: [
            {
              userId: l.owner,
              channel: "CALL",
              notes: "Introductory call — shared the project brochure and price range.",
              outcome: "Interested",
              completedAt: daysAgo(Math.max(0, l.daysAgo - 1)),
            },
          ],
        },
      },
    });
  }
  console.log(`  leads: ${leadSpecs.length}`);

  /* ------------------------------- Unit holds ------------------------------- */

  const heldUnits = await prisma.unit.findMany({ where: { projectId: project.id, status: "HELD" }, take: 5 });
  for (const u of heldUnits) {
    const existing = await prisma.unitHold.findFirst({ where: { unitId: u.id, isActive: true } });
    if (existing) continue;
    await prisma.unitHold.create({
      data: {
        unitId: u.id,
        heldById: sales.id,
        heldAt: daysAgo(2),
        expiresAt: daysAhead(5),
        isActive: true,
      },
    });
  }
  console.log(`  unit holds: ${heldUnits.length}`);

  /* ---------------------------- Material chain ---------------------------- */
  // A purchase order raised from the fully-approved indent, part-received,
  // then invoiced with a deliberate over-billing so the three-way match has
  // something real to block.

  const approvedIndent = await prisma.indent.findUnique({
    where: { indentNo: "IND/NNS/2026-27/9003" },
    include: { items: true },
  });
  const vendor = await prisma.vendor.findUnique({ where: { code: "V-BLDMT" } });

  if (approvedIndent && vendor && !(await prisma.purchaseOrder.findUnique({ where: { poNo: "PO/NNS/2026-27/9001" } }))) {
    const poLines = approvedIndent.items.map((l) => ({
      itemId: l.itemId,
      indentId: approvedIndent.id,
      orderedQty: Number(l.approvedQty ?? l.requestedQty),
      rate: Number(l.estimatedRate),
      taxPct: 18,
      amount: Number(l.approvedQty ?? l.requestedQty) * Number(l.estimatedRate) * 1.18,
    }));
    const subTotal = poLines.reduce((s2, l) => s2 + l.orderedQty * l.rate, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        poNo: "PO/NNS/2026-27/9001",
        projectId: project.id,
        vendorId: vendor.id,
        createdById: storeUser.id,
        poDate: daysAgo(9),
        expectedDate: daysAhead(2),
        subTotal,
        taxAmount: subTotal * 0.18,
        totalAmount: subTotal * 1.18,
        status: "APPROVED",
        approvedById: owner.id,
        approvedAt: daysAgo(8),
        items: { create: poLines },
      },
      include: { items: true },
    });

    // Part delivery: 70% arrives, a little rejected.
    const grn = await prisma.grn.create({
      data: {
        grnNo: "GRN/NNS/2026-27/9001",
        poId: po.id,
        vendorId: vendor.id,
        storeId: store.id,
        receivedById: storeUser.id,
        grnDate: daysAgo(4),
        challanNo: "DC-8841",
        challanDate: daysAgo(4),
        vehicleNo: "KA01AB1234",
        status: "INSPECTED",
        inspectedById: storeUser.id,
        inspectedAt: daysAgo(4),
        items: {
          create: po.items.map((l, idx) => {
            const ordered = Number(l.orderedQty);
            const received = Math.round(ordered * 0.7);
            const rejected = idx === 0 ? Math.max(1, Math.round(received * 0.05)) : 0;
            return {
              poItemId: l.id,
              itemId: l.itemId,
              receivedQty: received,
              acceptedQty: received - rejected,
              rejectedQty: rejected,
              shortQty: ordered - received,
              rate: Number(l.rate),
              rejectionReason: rejected > 0 ? "Edges chipped in transit" : null,
            };
          }),
        },
      },
    });

    await prisma.$transaction((tx) => postGrnToStock(tx, grn.id, storeUser.id));

    // The vendor bills for everything ordered, though only part arrived.
    const posted = await prisma.grnItem.findMany({ where: { grnId: grn.id } });
    const receivedByItem = new Map(posted.map((g) => [g.itemId, Number(g.acceptedQty)]));

    const invoiceLines = po.items.map((l) => ({
      itemId: l.itemId,
      invoicedQty: Number(l.orderedQty),
      rate: Number(l.rate),
      taxPct: 18,
      amount: Number(l.orderedQty) * Number(l.rate) * 1.18,
    }));
    const invSub = invoiceLines.reduce((s2, l) => s2 + l.invoicedQty * l.rate, 0);

    const match = threeWayMatch(
      po.items.map((l) => ({
        itemId: l.itemId,
        itemName: l.itemId,
        orderedQty: Number(l.orderedQty),
        receivedQty: receivedByItem.get(l.itemId) ?? 0,
        invoicedQty: Number(l.orderedQty),
        poRate: Number(l.rate),
        invoiceRate: Number(l.rate),
      })),
    );

    await prisma.vendorInvoice.create({
      data: {
        invoiceNo: "BM/2026/4471",
        poId: po.id,
        vendorId: vendor.id,
        invoiceDate: daysAgo(2),
        subTotal: invSub,
        taxAmount: invSub * 0.18,
        totalAmount: invSub * 1.18,
        matchResult: match as never,
        status: match.matched ? "MATCHED" : "MISMATCH",
        remarks: "Vendor billed the full order although delivery is still part-pending.",
        items: { create: invoiceLines },
      },
    });

    console.log("  material chain: 1 PO, 1 posted GRN, 1 mismatched invoice");
  }

  /* ------------------------------- Schedule -------------------------------- */

  if ((await prisma.scheduleActivity.count({ where: { projectId: project.id } })) === 0) {
    const wps = await prisma.workPackage.findMany({
      where: { phase: { projectId: project.id } },
      orderBy: { sequence: "asc" },
    });

    const plan: Array<[code: string, name: string, startDay: number, days: number, progress: number, milestone: boolean]> = [
      ["EXC", "Excavation & PCC", -240, 45, 100, false],
      ["RAFT", "Raft & footings", -195, 60, 100, true],
      ["COLA-7", "Tower A columns & slabs 1–7", -135, 120, 100, false],
      ["COLA-14", "Tower A columns & slabs 8–14", -15, 120, 35, false],
      ["COLB-7", "Tower B columns & slabs 1–7", -60, 120, 55, false],
      ["COLB-14", "Tower B columns & slabs 8–14", 60, 120, 0, false],
      ["BLK", "Blockwork & plastering", 120, 90, 0, false],
      ["MEP", "Electrical & plumbing", 150, 120, 0, false],
      ["HANDOVER", "Handover", 400, 1, 0, true],
    ];

    const rainDelay = await prisma.delayReason.findUnique({ where: { code: "RAIN" } });

    for (const [i, [code, name, startDay, days, progress, milestone]] of plan.entries()) {
      const plannedStart = daysAhead(startDay);
      const plannedEnd = daysAhead(startDay + days);
      // The two in-flight activities have slipped, so the variance report has teeth.
      const slipped = code === "COLA-14" || code === "COLB-7";

      await prisma.scheduleActivity.create({
        data: {
          projectId: project.id,
          workPackageId: wps[i % Math.max(1, wps.length)]?.id ?? null,
          code,
          name,
          sequence: i,
          baselineStart: plannedStart,
          baselineEnd: plannedEnd,
          plannedStart,
          plannedEnd: slipped ? daysAhead(startDay + days + 21) : plannedEnd,
          actualStart: progress > 0 ? plannedStart : null,
          actualEnd: progress >= 100 ? plannedEnd : null,
          progressPct: progress,
          isMilestone: milestone,
          isCriticalPath: ["RAFT", "COLA-14", "HANDOVER"].includes(code),
          status: progress >= 100 ? "COMPLETED" : slipped ? "DELAYED" : progress > 0 ? "IN_PROGRESS" : "NOT_STARTED",
          delayReasonId: slipped ? (rainDelay?.id ?? null) : null,
          delayNotes: slipped ? "Three weeks lost to unseasonal rain in the casting window." : null,
        },
      });
    }
    console.log(`  schedule: ${plan.length} activities`);
  }

  /* ----------------------------- Site progress ------------------------------ */

  if ((await prisma.siteProgressLog.count({ where: { projectId: project.id } })) === 0) {
    const logs: Array<[days: number, title: string, notes: string, manpower: number, weather: string]> = [
      [1, "Slab shuttering — Tower A, 12th floor", "Shuttering completed on the east wing; reinforcement starts tomorrow.", 42, "Clear"],
      [2, "Reinforcement binding — Tower A, 12th floor", "Binding 70% done. Two bar benders short.", 38, "Cloudy"],
      [3, "Blockwork — Tower B, 4th floor", "Blockwork on the north face completed up to lintel level.", 26, "Light rain"],
      [5, "Plastering — Tower B, 2nd & 3rd floor", "Internal plastering completed for eight units.", 31, "Clear"],
      [8, "Concrete pour — Tower A, 11th floor slab", "M30 pour completed, 62 cum. Curing started.", 55, "Clear"],
    ];

    for (const [days, title, notes, manpower, weather] of logs) {
      await prisma.siteProgressLog.create({
        data: {
          projectId: project.id,
          logDate: daysAgo(days),
          title,
          notes,
          manpowerCount: manpower,
          weather,
          latitude: 12.9081 + Math.random() * 0.001,
          longitude: 77.6476 + Math.random() * 0.001,
          loggedById: supervisor.id,
        },
      });
    }
    console.log(`  site progress: ${logs.length} logs`);
  }

  /* --------------------------- Sales: cost sheet → booking ------------------ */

  if ((await prisma.booking.count({ where: { projectId: project.id } })) === 0) {
    const priceList = await prisma.priceList.findFirst({
      where: { projectId: project.id, isActive: true },
      include: { items: true },
    });
    const heads = await prisma.chargeHead.findMany({
      where: { status: "ACTIVE" },
      include: { taxRate: { select: { percentage: true } } },
      orderBy: { sortOrder: "asc" },
    });
    const unit = await prisma.unit.findFirst({
      where: { projectId: project.id, status: "AVAILABLE", plcTag: { not: null } },
      orderBy: { unitNumber: "asc" },
    });
    const lead = await prisma.lead.findUnique({ where: { leadNo: "LD/00005" } });

    if (priceList?.items[0] && unit && lead) {
      const rate = priceList.items[0];
      const sheet = buildCostSheet(
        {
          unitNumber: unit.unitNumber,
          floorNumber: unit.floorNumber,
          superBuiltUpArea: Number(unit.superBuiltUpArea),
          carpetArea: Number(unit.carpetArea),
          parkingSlots: unit.parkingSlots,
          plcTag: unit.plcTag,
        },
        {
          baseRate: Number(rate.baseRate),
          floorRise: Number(rate.floorRise),
          plcAmount: Number(rate.plcAmount),
        },
        heads.map((h) => ({
          id: h.id, code: h.code, name: h.name, calcType: h.calcType,
          defaultValue: Number(h.defaultValue),
          taxPct: h.taxRate ? Number(h.taxRate.percentage) : 0,
          sortOrder: h.sortOrder, isMandatory: h.isMandatory,
        })),
        { includeOptional: ["CLUB"] },
      );

      const costSheet = await prisma.costSheet.create({
        data: {
          costSheetNo: "CS/NNS/2026-27/00001",
          unitId: unit.id,
          leadId: lead.id,
          baseRate: Number(rate.baseRate),
          subTotal: sheet.subTotal,
          discountAmount: 0,
          taxAmount: sheet.taxAmount,
          totalAmount: sheet.totalAmount,
          validUntil: daysAhead(15),
          createdById: salesHead.id,
          createdAt: daysAgo(12),
          lines: {
            create: sheet.lines.map((l) => ({
              chargeHeadId: l.chargeHeadId, label: l.label, quantity: l.quantity,
              rate: l.rate, amount: l.amount, taxPct: l.taxPct,
              taxAmount: l.taxAmount, sortOrder: l.sortOrder,
            })),
          },
        },
      });

      const customer = await prisma.customer.create({
        data: {
          customerNo: "CUST/00001",
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          panNumber: "AXKPS4471M",
          addressLine: "14, 2nd Cross, HSR Layout, Bengaluru",
          kycVerifiedAt: daysAgo(9),
        },
      });

      const bookingDate = daysAgo(10);
      const booking = await prisma.booking.create({
        data: {
          bookingNo: "BKG/NNS/2026-27/0001",
          projectId: project.id,
          unitId: unit.id,
          customerId: customer.id,
          leadId: lead.id,
          costSheetId: costSheet.id,
          bookingDate,
          totalAmount: sheet.totalAmount,
          soldById: salesHead.id,
          status: "CONFIRMED",
        },
      });

      const schedule = buildPaymentSchedule(sheet.totalAmount, bookingDate);
      let received = 0;
      for (const m of schedule) {
        // The first two milestones have been raised; the first is collected.
        const raised = m.sortOrder <= 1;
        const paid = m.sortOrder === 0;
        if (paid) received += m.amount;

        const demand = await prisma.paymentDemand.create({
          data: {
            demandNo: `DMD/NNS/${String(m.sortOrder + 1).padStart(5, "0")}`,
            bookingId: booking.id,
            milestone: m.milestone,
            dueDate: m.dueDate,
            amount: m.amount,
            totalAmount: m.amount,
            receivedAmount: paid ? m.amount : 0,
            sortOrder: m.sortOrder,
            raisedAt: raised ? bookingDate : null,
            status: paid ? "PAID" : raised ? "RAISED" : "PENDING",
          },
        });

        if (paid) {
          const bank = await prisma.bank.findFirst({ where: { code: "HDFC" } });
          await prisma.receipt.create({
            data: {
              receiptNo: "RCT/NNS/00001",
              bookingId: booking.id,
              demandId: demand.id,
              receiptDate: daysAgo(9),
              amount: m.amount,
              mode: "NEFT",
              referenceNo: "HDFCN52310099",
              bankId: bank?.id ?? null,
            },
          });
        }
      }

      await prisma.booking.update({ where: { id: booking.id }, data: { receivedAmount: received } });
      await prisma.unit.update({ where: { id: unit.id }, data: { status: "BOOKED" } });
      await prisma.lead.update({ where: { id: lead.id }, data: { state: "BOOKED" } });

      console.log(`  sales: cost sheet + booking on unit ${unit.unitNumber} (${schedule.length} demands, 1 receipt)`);
    }
  }

  console.log("\nDemo data ready.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
