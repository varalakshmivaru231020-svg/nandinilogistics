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
      companies: { orderBy: { createdAt: "asc" }, select: { company: { select: { id: true, name: true } } } },
    },
  });
}

type OwnRider = NonNullable<Awaited<ReturnType<typeof ownRider>>>;

/** The `rider` block of `/me`. */
export function riderPayload(e: OwnRider) {
  return {
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
