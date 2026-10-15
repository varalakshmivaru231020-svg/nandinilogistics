import "server-only";

import type { ScreenRow } from "@/lib/screens/rows";
import { money } from "@/lib/utils";

export { customerEmpty } from "@/lib/sales/customer-display";

/**
 * The customer row, as the table in `customers-screen.tsx` draws one: the name
 * with its customer number, the contact — masked for anyone who may not see
 * KYC — the PAN, the units booked as chips, what they are worth, and whether
 * KYC has been verified.
 */

export interface CustomerRowInput {
  id: string;
  name: string;
  customerNo: string;
  phone: string;
  email: string | null;
  panNumber: string | null;
  kycVerified: boolean;
  bookings: Array<{ unitNumber: string; status: string; totalAmount: number }>;
}

export function customerScreenRow(c: CustomerRowInput, canViewKyc: boolean): ScreenRow {
  const booked = c.bookings
    .filter((b) => b.status !== "CANCELLED")
    .reduce((s, b) => s + b.totalAmount, 0);

  return {
    id: c.id,
    title: c.name,
    meta: c.customerNo,
    chips: c.bookings.map((b) => ({
      text: b.unitNumber,
      tone: b.status === "CANCELLED" ? ("bad" as const) : ("info" as const),
    })),
    lines: [
      { label: "Contact", value: canViewKyc ? c.phone : "••••••" },
      ...(c.email ? [{ value: c.email }] : []),
      ...(canViewKyc ? [{ label: "PAN", value: c.panNumber ?? "—" }] : []),
      ...(c.bookings.length === 0 ? [{ value: "No booking" }] : []),
    ],
    ...(booked > 0 ? { trailing: { value: money(booked), label: "Booked value" } } : {}),
    status: c.kycVerified
      ? { label: "Verified", tone: "good" }
      : { label: "Pending", tone: "warn" },
  };
}
