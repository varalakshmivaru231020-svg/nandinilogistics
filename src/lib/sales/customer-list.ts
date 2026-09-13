import type { Prisma } from "@prisma/client";

import { joinFilters, pick, readParam, searchWords, type ParamSource } from "./list-common";

/**
 * The Customers list's filters — search, KYC, booking — shared by the screen
 * and its export.
 */

export const CUSTOMER_KYC = ["verified", "pending"] as const;
export const CUSTOMER_BOOKING = ["booked", "active", "none"] as const;

export interface CustomerListParams {
  q: string;
  kyc: string;
  booking: string;
}

export function readCustomerListParams(source: ParamSource): CustomerListParams {
  return { q: readParam(source, "q"), kyc: readParam(source, "kyc"), booking: readParam(source, "booking") };
}

/**
 * @param canSeeKyc whether the viewer may see phone and PAN (`sales.customer.viewKyc`).
 *                  Without it those fields are masked on screen, so they are not
 *                  searchable either — a search must not confirm a hidden number.
 */
export function customerListWhere(p: CustomerListParams, canSeeKyc: boolean): Prisma.CustomerWhereInput {
  const q = p.q.trim();
  const kyc = pick(p.kyc, CUSTOMER_KYC);
  const booking = pick(p.booking, CUSTOMER_BOOKING);

  const or: Prisma.CustomerWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { customerNo: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    { bookings: { some: { bookingNo: { contains: q, mode: "insensitive" } } } },
    { bookings: { some: { unit: { unitNumber: { contains: q, mode: "insensitive" } } } } },
  ];
  if (canSeeKyc) {
    or.push({ phone: { contains: q } }, { panNumber: { contains: q, mode: "insensitive" } });
  }

  return {
    ...(q ? { OR: or } : {}),
    ...(kyc === "verified" ? { kycVerifiedAt: { not: null } } : {}),
    ...(kyc === "pending" ? { kycVerifiedAt: null } : {}),
    ...(booking === "booked" ? { bookings: { some: {} } } : {}),
    ...(booking === "active" ? { bookings: { some: { status: { not: "CANCELLED" } } } } : {}),
    ...(booking === "none" ? { bookings: { none: {} } } : {}),
  };
}

const KYC_WORDS: Record<string, string> = { verified: "KYC verified", pending: "KYC pending" };
const BOOKING_WORDS: Record<string, string> = {
  booked: "With a booking", active: "With an active booking", none: "No booking",
};

export function describeCustomerFilters(p: CustomerListParams): string {
  return joinFilters(
    [searchWords(p.q.trim()), KYC_WORDS[p.kyc], BOOKING_WORDS[p.booking]],
    "All customers",
  );
}
