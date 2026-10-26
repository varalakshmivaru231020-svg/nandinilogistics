import "dotenv/config";
/**
 * Seeds the platform: permission catalogue, roles with their default access
 * matrix, master data, lead stages and demo users.
 *
 *   pnpm db:seed
 *
 * Idempotent — safe to re-run. Existing rows are updated, not duplicated.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/registry";
import { applyRoleGrants } from "./role-matrix";
import { seedWorkforce } from "./workforce-seed";
import { seedMasters } from "./masters-seed";
import { seedLeadReference } from "./lead-seed";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Nandini@2026";

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
    { employeeCode: "NLS-0001", name: "Nandini Admin", email: "admin@nandini.example", phone: "9845000001", role: "ADMIN", dept: "ADMIN", desig: "ADMIN", isSuperAdmin: true },
    { employeeCode: "NLS-0002", name: "Manjunath Gowda", email: "tl@nandini.example", phone: "9845000002", role: "TEAM_LEADER", dept: "OPS", desig: "TL" },
    { employeeCode: "NLS-0003", name: "Priya Shetty", email: "telecaller@nandini.example", phone: "9845000003", role: "TELE_CALLER", dept: "CRM", desig: "TELE" },
    { employeeCode: "NLS-0004", name: "Arun Kumar", email: "telecaller2@nandini.example", phone: "9845000004", role: "TELE_CALLER", dept: "CRM", desig: "TELE" },
    { employeeCode: "NLS-0005", name: "Ramesh Yadav", email: "rider@nandini.example", phone: "9845066120", role: "RIDER", dept: "OPS", desig: "RIDER" },
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

async function main() {
  console.log("\nSeeding Nandini Logistics Rider CRM\n");
  await seedPermissions();
  await applyRoleGrants(prisma);
  await seedMasters(prisma);
  await seedLeadReference(prisma);
  await seedUsers();
  await seedWorkforce(prisma);
  console.log("\nSeed complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
