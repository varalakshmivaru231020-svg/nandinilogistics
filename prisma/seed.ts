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
import { applyRoleGrants } from "./role-matrix";
import { seedWorkforceAndKb } from "./workforce-seed";
import { seedBoardRecords } from "./board-records-seed";
import { seedMasters, NUMBERING } from "./masters-seed";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Nninfra@2026";

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
      // The design's NN Skyline is 4.20 acres; 218000 was its area in square
      // feet, shown as acres by a screen that assumed the unit.
      landArea: 4.2,
      landAreaText: "4.20 acres",
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

  await seedBoardRecords(prisma, project.id);

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
  await applyRoleGrants(prisma);
  await seedMasters(prisma);
  await seedUsers();
  await seedApprovalLimits();
  await seedDemoProject();
  await seedWorkforceAndKb(prisma);
  console.log("\nSeed complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
