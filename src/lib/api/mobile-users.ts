import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";
import { phoneKey } from "@/lib/sales/lead-schema";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The user a mobile number belongs to.
 *
 * `User.phone` is stored however it was typed — "+91 98765 43210",
 * "09876543210" — so the match is on the normalised key. Candidates are
 * narrowed by the last four digits in SQL and compared exactly here.
 */
export async function findUserByMobile(mobile: string, db: Db = prisma) {
  const key = phoneKey(mobile);
  if (key.length < 8) return null;
  const candidates = await db.user.findMany({
    where: { phone: { contains: key.slice(-4) } },
    select: {
      id: true, email: true, name: true, phone: true, passwordHash: true, pinHash: true,
      status: true, isSuperAdmin: true,
    },
    orderBy: { createdAt: "asc" },
  });
  // Prefer an active login if a number was ever reused.
  const matches = candidates.filter((u) => u.phone && phoneKey(u.phone) === key);
  return matches.find((u) => u.status === "ACTIVE") ?? matches[0] ?? null;
}
