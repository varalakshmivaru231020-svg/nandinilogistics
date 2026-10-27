import "dotenv/config";
/**
 * Fills every module with believable demo data, so a walkthrough has
 * something on each screen.
 *
 *   pnpm db:demo
 *
 * Re-runnable: every row it makes carries a DEMO- number or a fixed demo
 * Rider ID (NL101–NL104) and is removed before being made again. Run
 * `pnpm db:seed` first — this builds on the seeded users, companies and riders.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const DEMO_RIDERS = ["NL101", "NL102", "NL103", "NL104"];

/** Midnight UTC of the day `n` days from today — how @db.Date columns store a day. */
function day(n: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
/** A time on that day, given as Indian hours and minutes. */
function at(n: number, hh: number, mm: number): Date {
  return new Date(day(n).getTime() + (hh * 60 + mm - 330) * 60_000);
}

async function main() {
  console.log("\nLoading demo data\n");

  const user = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const [admin, tl, tele, tele2, riderUser] = await Promise.all([
    user("admin@nandini.example"), user("tl@nandini.example"), user("telecaller@nandini.example"),
    user("telecaller2@nandini.example"), user("rider@nandini.example"),
  ]);
  const company = async (code: string) => prisma.company.findUniqueOrThrow({ where: { code } });
  const [peeko, slikk, purple, firstclub, internal] = await Promise.all(
    ["PEEKO", "SLIKK", "PURPLE", "FIRSTCLUB", "INTERNAL"].map(company),
  );
  const emp = async (code: string) => prisma.employee.findUniqueOrThrow({ where: { employeeCode: code } });
  const [ramesh, suresh, imran, prakash, kavitha] = await Promise.all(
    ["NL001", "NL002", "NL003", "NL004", "NL005"].map(emp),
  );
  const riderType = await prisma.employmentType.findUniqueOrThrow({ where: { name: "Rider" } });
  const stage = async (code: string) => prisma.leadStage.findUniqueOrThrow({ where: { code } });
  const [sNew, sInterested, sTraining, sOnboarding, sLost] = await Promise.all(
    ["NEW", "INTERESTED", "TRAINING", "ONBOARDING", "LOST"].map(stage),
  );
  const lostReason = await prisma.lostReason.findUniqueOrThrow({ where: { code: "JOINED_ELSEWHERE" } });
  const reason = async (code: string) => prisma.advanceReason.findUniqueOrThrow({ where: { code } });
  const [medical, vehicle] = await Promise.all([reason("MEDICAL"), reason("VEHICLE")]);

  /* ------------------------------------------------------------ clear */
  const demoEmployees = await prisma.employee.findMany({ where: { employeeCode: { in: DEMO_RIDERS } }, select: { id: true } });
  const demoIds = demoEmployees.map((e) => e.id);
  const allRiders = [ramesh.id, suresh.id, imran.id, prakash.id, kavitha.id, ...demoIds];
  await prisma.payoutImport.deleteMany({ where: { fileName: { startsWith: "DEMO-" } } });
  await prisma.advance.deleteMany({ where: { employeeId: { in: allRiders } } });
  await prisma.bikeRent.deleteMany({ where: { employeeId: { in: allRiders } } });
  await prisma.profileEditRequest.deleteMany({ where: { employeeId: { in: allRiders } } });
  await prisma.payslip.deleteMany({ where: { employeeId: { in: allRiders } } });
  await prisma.attendanceEntry.deleteMany({ where: { employeeId: { in: allRiders } } });
  await prisma.task.deleteMany({ where: { taskNo: { startsWith: "DEMO-" } } });
  await prisma.clientInvoice.deleteMany({ where: { invoiceNo: { startsWith: "DEMO-" } } });
  await prisma.lead.deleteMany({ where: { leadNo: { startsWith: "DEMO-" } } });
  await prisma.employee.updateMany({ where: { referredById: { in: demoIds } }, data: { referredById: null } });
  await prisma.employee.deleteMany({ where: { id: { in: demoIds } } });

  /* -------------------------------------------- companies and team leader */
  await prisma.companyTeamLeader.deleteMany({ where: { userId: tl.id } });
  await prisma.companyTeamLeader.createMany({
    data: [{ companyId: peeko.id, userId: tl.id }, { companyId: slikk.id, userId: tl.id }],
  });
  await prisma.companyLocation.deleteMany({ where: { companyId: { in: [peeko.id, slikk.id] }, name: { startsWith: "Demo" } } });
  await prisma.companyLocation.createMany({
    data: [
      { companyId: peeko.id, name: "Demo hub · Koramangala", address: "80 Feet Rd, Koramangala, Bengaluru", latitude: 12.9352, longitude: 77.6245 },
      { companyId: peeko.id, name: "Demo hub · HSR Layout", address: "27th Main, HSR Layout, Bengaluru", latitude: 12.9116, longitude: 77.6474 },
      { companyId: slikk.id, name: "Demo hub · Indiranagar", address: "100 Feet Rd, Indiranagar, Bengaluru", latitude: 12.9719, longitude: 77.6412 },
    ],
  });

  /* ----------------------------------------------------- existing riders */
  const pin = await bcrypt.hash("1234", 12);
  await prisma.employee.updateMany({ where: { userId: riderUser.id, NOT: { id: ramesh.id } }, data: { userId: null } });
  await prisma.user.update({ where: { id: riderUser.id }, data: { phone: "9845066120", pinHash: pin } });
  await prisma.user.update({ where: { id: tl.id }, data: { pinHash: pin } });

  const riderDetails = (i: number) => ({
    emergencyMobileFamily: `98450${10000 + i}`,
    emergencyMobileFriend: `99860${20000 + i}`,
    bankAccountNo: `5010012345${i}`,
    bankHolderName: "As per passbook",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC Bank",
    insuranceNumber: `INS-2026-${1000 + i}`,
    address: "Koramangala, Bengaluru",
  });
  const riders: Array<[typeof ramesh, string, number]> = [
    [ramesh, peeko.id, 1], [suresh, peeko.id, 2], [imran, slikk.id, 3], [prakash, purple.id, 4],
  ];
  for (const [r, companyId, i] of riders) {
    await prisma.employee.update({
      where: { id: r.id },
      data: {
        ...riderDetails(i),
        ...(r.id === ramesh.id ? { userId: riderUser.id, mobile: "9845066120" } : {}),
        joinedOn: day(-40 + i * 3),
        companies: { deleteMany: {}, create: [{ companyId }] },
      },
    });
  }
  // Suresh was referred by Ramesh and joined recently, so the referral is still valid.
  await prisma.employee.update({ where: { id: suresh.id }, data: { referredById: ramesh.id, joinedOn: day(-10) } });
  await prisma.employee.update({
    where: { id: kavitha.id },
    data: { monthlySalary: 18000, joinedOn: day(-200), companies: { deleteMany: {}, create: [{ companyId: internal.id }] } },
  });

  /* ------------------------------------------- onboarding in every state */
  const newRider = (code: string, name: string, mobile: string, status: "DRAFT" | "SUBMITTED" | "REJECTED", companyId: string, extra: object = {}) =>
    prisma.employee.create({
      data: {
        employeeCode: code, name, mobile, aadhaar: `5${mobile.slice(-11).padStart(11, "1")}`,
        employmentTypeId: riderType.id, onboardingStatus: status, status: "ACTIVE",
        referralCode: `REF-${code}`, companies: { create: [{ companyId }] },
        ...(status !== "DRAFT" ? { submittedAt: new Date(Date.now() - DAY) } : {}),
        ...extra,
      },
    });
  await newRider("NL101", "Vikram Singh", "9900112233", "SUBMITTED", peeko.id, { ...riderDetails(11) });
  await newRider("NL102", "Anil Gowda", "9900223344", "SUBMITTED", slikk.id, { ...riderDetails(12), referredById: ramesh.id, referralApproval: "PENDING", referralSetById: tele.id });
  await newRider("NL103", "Mohammed Arif", "9900334455", "DRAFT", firstclub.id);
  await newRider("NL104", "Ravi Teja", "9900445566", "REJECTED", purple.id, {
    ...riderDetails(14), decidedById: tl.id, decidedAt: new Date(), rejectionReason: "Aadhaar photo is blurred — please upload a clear copy.",
  });

  /* ---------------------------------------------------------------- leads */
  const leads: Array<{ name: string; phone: string; location: string; stageId: string; ownerId: string; companyId: string; next?: number; approval?: "PENDING"; lost?: boolean; createdById: string }> = [
    { name: "Karthik R", phone: "9811000001", location: "Koramangala", stageId: sNew.id, ownerId: tele.id, companyId: peeko.id, next: 0, createdById: tl.id },
    { name: "Sandeep M", phone: "9811000002", location: "HSR Layout", stageId: sInterested.id, ownerId: tele.id, companyId: peeko.id, next: -2, createdById: admin.id },
    { name: "Naveen K", phone: "9811000003", location: "Indiranagar", stageId: sTraining.id, ownerId: tele2.id, companyId: slikk.id, next: 1, createdById: tl.id },
    { name: "Vikram Singh", phone: "9900112233", location: "BTM Layout", stageId: sOnboarding.id, ownerId: tele.id, companyId: peeko.id, createdById: tl.id },
    { name: "Deepak S", phone: "9811000005", location: "Whitefield", stageId: sInterested.id, ownerId: tele2.id, companyId: purple.id, next: 0, createdById: admin.id },
    { name: "Rahul P", phone: "9811000006", location: "Marathahalli", stageId: sLost.id, ownerId: tele.id, companyId: firstclub.id, lost: true, createdById: tl.id },
    { name: "Ganesh B", phone: "9811000007", location: "Jayanagar", stageId: sNew.id, ownerId: tele.id, companyId: peeko.id, approval: "PENDING", createdById: tele.id },
    { name: "Shiva Kumar", phone: "9811000008", location: "Electronic City", stageId: sNew.id, ownerId: tele.id, companyId: slikk.id, approval: "PENDING", createdById: tele.id },
  ];
  for (const [i, l] of leads.entries()) {
    const lead = await prisma.lead.create({
      data: {
        leadNo: `DEMO-L${String(i + 1).padStart(3, "0")}`, name: l.name, phone: l.phone, location: l.location,
        stageId: l.stageId, ownerId: l.ownerId, assignedAt: new Date(Date.now() - (i + 2) * DAY),
        nextActionAt: l.next === undefined ? null : at(l.next, 11, 0),
        approval: l.approval ?? "APPROVED", createdById: l.createdById,
        ...(l.lost ? { lostReasonId: lostReason.id, lostNotes: "Took a job at another delivery company." } : {}),
        companies: { create: [{ companyId: l.companyId }] },
        createdAt: new Date(Date.now() - (i + 2) * DAY),
      },
    });
    if (!l.approval) {
      await prisma.leadFollowUp.create({
        data: {
          leadId: lead.id, userId: l.ownerId, channel: "CALL", stageId: l.stageId,
          notes: "Called and explained the job, weekly payout and bike rent.", outcome: "Interested",
          nextActionAt: lead.nextActionAt, completedAt: new Date(Date.now() - (i + 1) * DAY),
        },
      });
    }
    if (l.name === "Vikram Singh") {
      await prisma.employee.update({ where: { employeeCode: "NL101" }, data: { leadId: lead.id } });
    }
  }

  /* ----------------------------------------------- advances and bike rent */
  await prisma.advance.create({
    data: { employeeId: ramesh.id, amount: 3000, priority: "LOW", reasonId: vehicle.id, remarks: "Bike service and new tyre",
      status: "APPROVED", decidedById: tl.id, decidedAt: day(-6), recoveryPerPeriod: 500, recoveredAmount: 500 },
  });
  await prisma.advance.create({
    data: { employeeId: suresh.id, amount: 5000, priority: "EMERGENCY", reasonId: medical.id, remarks: "Mother admitted to hospital" },
  });
  await prisma.advance.create({
    data: { employeeId: imran.id, amount: 1500, priority: "LOW", reasonId: vehicle.id, remarks: "Phone screen repair" },
  });
  await prisma.bikeRent.create({
    data: { employeeId: ramesh.id, bikeNumber: "KA01 AB 1234", rentPerWeek: 300, startDate: day(-30), notes: "Company bike" },
  });
  await prisma.bikeRent.create({
    data: { employeeId: imran.id, bikeNumber: "KA05 CD 5678", rentPerWeek: 350, startDate: day(-20) },
  });

  /* --------------------------------------------------------------- payouts */
  const lastMon = day(-((new Date().getDay() + 6) % 7) - 7);
  const lastSun = new Date(lastMon.getTime() + 6 * DAY);
  const line = (riderCode: string, employeeId: string | null, total: number, advance: number, bike: number, tds: number, extra: object = {}) => ({
    riderCode, employeeId, totalPayout: total, advance, bikeRental: bike, tds,
    finalPayout: Math.max(0, total - advance - bike - tds), ...extra,
  });
  await prisma.payoutImport.create({
    data: {
      companyId: peeko.id, periodFrom: lastMon, periodTo: lastSun, fileName: "DEMO-peeko-week.xlsx",
      status: "POSTED", uploadedById: admin.id, postedById: admin.id, postedAt: new Date(Date.now() - DAY),
      lines: {
        create: [
          line("NL001", ramesh.id, 6200, 500, 300, 62),
          line("NL002", suresh.id, 5400, 0, 0, 54, { status: "HOLD", holdReason: "Two missing delivery proofs — waiting for the hub to confirm." }),
        ],
      },
    },
  });
  await prisma.payoutImport.create({
    data: {
      companyId: slikk.id, periodFrom: lastMon, periodTo: lastSun, fileName: "DEMO-slikk-week.xlsx",
      status: "DRAFT", uploadedById: admin.id,
      lines: { create: [line("NL003", imran.id, 4800, 0, 350, 48), line("NL099", null, 3900, 0, 0, 39)] },
    },
  });

  /* ------------------------------------------------------------- attendance */
  for (let n = -6; n <= -1; n++) {
    for (const [r, inH, outH] of [[ramesh, 9, 19], [suresh, 10, 18], [imran, 9, 13]] as const) {
      await prisma.attendanceEntry.create({
        data: {
          employeeId: r.id, attendanceOn: day(n), status: outH - inH < 4 ? "HALF_DAY" : "PRESENT",
          punchInAt: at(n, inH, 5), punchInLat: 12.9352, punchInLng: 77.6245,
          punchOutAt: at(n, outH, 40), punchOutLat: 12.9360, punchOutLng: 77.6251,
        },
      });
    }
    await prisma.attendanceEntry.create({
      data: { employeeId: kavitha.id, attendanceOn: day(n), status: "PRESENT", markedById: admin.id },
    });
  }

  /* ---------------------------------------------------- profile change, tasks */
  await prisma.profileEditRequest.create({
    data: { employeeId: ramesh.id, changes: { bankAccountNo: "50100987654321", bankName: "ICICI Bank", bankIfsc: "ICIC0000123" }, reason: "Moved my salary account to ICICI." },
  });
  const tasks = [
    { title: "Collect pending KYC from Peeko riders", priority: "HIGH" as const, due: 1, status: "IN_PROGRESS" as const },
    { title: "Hold a safety briefing at the Koramangala hub", priority: "MEDIUM" as const, due: 3, status: "OPEN" as const },
    { title: "Verify bike documents for new riders", priority: "LOW" as const, due: -1, status: "OPEN" as const },
  ];
  for (const [i, t] of tasks.entries()) {
    await prisma.task.create({
      data: {
        taskNo: `DEMO-T${i + 1}`, title: t.title, priority: t.priority, status: t.status,
        description: "Raised for the demo.", dueAt: at(t.due, 18, 0), createdById: admin.id,
        ...(t.status === "IN_PROGRESS" ? { startedAt: new Date(Date.now() - DAY) } : {}),
        assignees: { create: [{ userId: tl.id }] },
      },
    });
  }

  /* --------------------------------------------------------------- invoices */
  await prisma.clientInvoice.create({
    data: { invoiceNo: "DEMO-INV-001", companyId: peeko.id, invoiceDate: day(-20), dueDate: day(-5), amount: 245000, status: "PARTIALLY_PAID",
      notes: "Rider services — September", payments: { create: [{ amount: 150000, paidOn: day(-8), reference: "NEFT UTR 4471" }] } },
  });
  await prisma.clientInvoice.create({
    data: { invoiceNo: "DEMO-INV-002", companyId: slikk.id, invoiceDate: day(-3), dueDate: day(27), amount: 118500, status: "SENT", notes: "Rider services — October, week 3" },
  });

  console.log("  riders linked and detailed, 4 onboarding forms, 8 leads, 3 advances, 2 bike rents,");
  console.log("  2 payout imports, 6 days of attendance, 1 profile change, 3 tasks, 2 invoices");
  console.log("\n  Rider app PIN login: mobile 9845066120, PIN 1234");
  console.log("  Team Leader PIN login: mobile 9845000002, PIN 1234\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
