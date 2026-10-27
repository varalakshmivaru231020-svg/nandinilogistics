import type { Prisma, PrismaClient } from "@prisma/client";

import { nextDocumentNumber } from "@/lib/numbering";
import { referralCodeFor } from "@/lib/riders/referrals";

/**
 * Every staff login gets a person record, so Tele-callers and Team Leaders can
 * check in like a rider. Riders are excluded — their record comes from
 * onboarding — and so is the platform owner (super admin, web only).
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The employment type a login's record is given, or null for none. Pure. */
export function staffTypeFor(user: { isSuperAdmin: boolean; roleCodes: string[] }): string | null {
  if (user.isSuperAdmin) return null;
  if (user.roleCodes.includes("RIDER")) return null;
  if (user.roleCodes.includes("TEAM_LEADER")) return "Team Leader";
  return "Internal Staff";
}

/**
 * Links a login to a person record: the one already linked, or an unlinked
 * one with the same mobile, or a new one — accepted, active, with a Rider ID
 * from the series. Runs inside the caller's transaction.
 */
export async function linkStaffEmployee(
  tx: Prisma.TransactionClient,
  user: { id: string; name: string; phone: string | null; isSuperAdmin: boolean; roleCodes: string[] },
  now: Date,
): Promise<{ id: string; created: boolean; linked: boolean } | null> {
  const typeName = staffTypeFor(user);
  if (!typeName) return null;

  const existing = await tx.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (existing) return { id: existing.id, created: false, linked: false };

  if (user.phone) {
    const sameMobile = await tx.employee.findFirst({
      where: { mobile: user.phone, userId: null },
      select: { id: true },
    });
    if (sameMobile) {
      await tx.employee.update({ where: { id: sameMobile.id }, data: { userId: user.id } });
      return { id: sameMobile.id, created: false, linked: true };
    }
  }

  const type = await ensureType(tx, typeName);
  const employeeCode = await nextDocumentNumber(tx, "RIDER");
  const created = await tx.employee.create({
    data: {
      employeeCode,
      name: user.name,
      mobile: user.phone ?? "",
      aadhaar: "",
      employmentTypeId: type,
      onboardingStatus: "ACCEPTED",
      status: "ACTIVE",
      decidedAt: now,
      joinedOn: now,
      referralCode: referralCodeFor(employeeCode),
      userId: user.id,
    },
    select: { id: true },
  });
  return { id: created.id, created: true, linked: false };
}

async function ensureType(db: Db, name: string): Promise<string> {
  const found = await db.employmentType.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (found) return found.id;
  const made = await db.employmentType.create({ data: { name }, select: { id: true } });
  return made.id;
}
