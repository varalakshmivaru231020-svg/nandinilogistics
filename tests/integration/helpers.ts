import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();

export const prisma = new PrismaClient();

/** Unique suffix so parallel-ish runs and reruns never collide on unique codes. */
export function tag(): string {
  return `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** The seeded demo accounts, one per role. */
export async function seededUsers() {
  const [admin, teamLeader, teleCaller, teleCaller2, rider] = await Promise.all([
    prisma.user.findUnique({ where: { email: "admin@nandini.example" } }),
    prisma.user.findUnique({ where: { email: "tl@nandini.example" } }),
    prisma.user.findUnique({ where: { email: "telecaller@nandini.example" } }),
    prisma.user.findUnique({ where: { email: "telecaller2@nandini.example" } }),
    prisma.user.findUnique({ where: { email: "rider@nandini.example" } }),
  ]);
  if (!admin || !teamLeader || !teleCaller || !teleCaller2 || !rider) {
    throw new Error("Run `pnpm db:seed` before the integration tests.");
  }
  return { admin, teamLeader, teleCaller, teleCaller2, rider };
}

/** The seeded lead stage of a given kind — NEW, ONBOARDING or LOST. */
export async function stageOfKind(kind: "NEW" | "OPEN" | "ONBOARDING" | "LOST") {
  const stage = await prisma.leadStage.findFirst({ where: { kind, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
  if (!stage) throw new Error("Run `pnpm db:seed` before the integration tests.");
  return stage;
}

/** A seeded client company. */
export async function seededCompany(code = "PEEKO") {
  const company = await prisma.company.findUnique({ where: { code } });
  if (!company) throw new Error("Run `pnpm db:seed` before the integration tests.");
  return company;
}

export const n = (v: unknown) => Number(v ?? 0);
