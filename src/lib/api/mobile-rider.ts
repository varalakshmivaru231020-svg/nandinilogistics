import "server-only";

import { prisma } from "@/lib/db";

/** Where the app fetches the signed-in rider's own photo — guarded by the bearer token. */
export const OWN_PHOTO_PATH = "/api/mobile/v1/photo";

/** The signed-in person's own rider record, with what the app's screens show. */
export async function ownRider(userId: string) {
  return prisma.employee.findUnique({
    where: { userId },
    select: {
      id: true, employeeCode: true, name: true, mobile: true, photoKey: true,
      onboardingStatus: true, rejectionReason: true, referralCode: true,
      insuranceNumber: true, emergencyMobileFamily: true, joinedOn: true, status: true,
      temporaryCity: true, temporaryState: true,
      companies: { orderBy: { createdAt: "asc" }, select: { company: { select: { id: true, name: true } } } },
    },
  });
}

type OwnRider = NonNullable<Awaited<ReturnType<typeof ownRider>>>;

/** A sheet column that is an incentive, by its header — "Incentive", "Weekly incentives", "Bonus". */
export const INCENTIVE_COLUMN = /incentive|bonus/i;

/**
 * What the rider has earned in incentives: the sum of every incentive-like
 * column across their posted payout lines. Nil when their companies' sheets
 * carry no such column — the app then shows no Incentives entry at all,
 * rather than a zero.
 */
export function incentivesIn(lines: ReadonlyArray<{ raw: unknown }>): number | null {
  let seen = false;
  let total = 0;
  for (const l of lines) {
    const raw = (l.raw ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      if (!INCENTIVE_COLUMN.test(k)) continue;
      seen = true;
      const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
      if (Number.isFinite(n)) total += n;
    }
  }
  return seen ? Math.round(total * 100) / 100 : null;
}

export async function ownIncentives(employeeId: string): Promise<number | null> {
  const lines = await prisma.payoutLine.findMany({
    where: { employeeId, import: { status: "POSTED" } },
    select: { raw: true },
  });
  return incentivesIn(lines);
}

/** The `rider` block of `/me`. */
export function riderPayload(e: OwnRider, extra: { incentives?: number | null } = {}) {
  return {
    incentives: extra.incentives ?? null,
    /** Where they are deployed — the current (professional) address's city and state. */
    location: [e.temporaryCity, e.temporaryState].filter((p) => p && p.trim()).join(", ") || null,
    status: e.status,
    id: e.id,
    riderId: e.employeeCode,
    name: e.name,
    mobile: e.mobile,
    photoUrl: e.photoKey ? OWN_PHOTO_PATH : null,
    onboardingStatus: e.onboardingStatus,
    rejectionReason: e.rejectionReason,
    companies: e.companies.map((c) => ({ id: c.company.id, name: c.company.name })),
    referralCode: e.referralCode,
    insuranceNumber: e.insuranceNumber,
    emergencyMobileFamily: e.emergencyMobileFamily,
    joinedOn: e.joinedOn ? e.joinedOn.toISOString().slice(0, 10) : null,
  };
}

/**
 * Who a rider calls for help — Nandini Logistics' own phone and email, kept
 * on the Internal Staff company record so Admin can change them.
 */
export async function supportContact(): Promise<{ phone: string | null; email: string | null }> {
  const row = await prisma.company.findUnique({ where: { code: "INTERNAL" }, select: { phone: true, email: true } });
  return { phone: row?.phone ?? null, email: row?.email ?? null };
}
