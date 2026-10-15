import "server-only";

import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, money } from "@/lib/utils";

/**
 * The booking row, as the table in `src/app/(app)/sales/bookings/page.tsx`
 * draws one: the booking number with its project and unit, the customer and
 * their phone, when it was booked, what it is worth, how much has been
 * collected and what percentage that is, what is overdue against its demands,
 * who sold it and the status.
 */

export const BOOKING_STATUS_TONE: Record<string, "slate" | "good" | "navy" | "brand" | "bad"> = {
  DRAFT: "slate", CONFIRMED: "good", AGREEMENT: "brand", REGISTERED: "navy", CANCELLED: "bad",
};

export interface BookingRowInput {
  id: string;
  bookingNo: string;
  status: string;
  bookingDate: Date | string;
  projectCode: string;
  unitNumber: string;
  customerName: string;
  customerPhone: string;
  soldBy: string | null;
  totalAmount: number;
  receivedAmount: number;
  overdueAmount: number;
}

export function bookingScreenRow(b: BookingRowInput): ScreenRow {
  const pct = b.totalAmount > 0 ? Math.round((b.receivedAmount / b.totalAmount) * 100) : 0;

  return {
    id: b.id,
    title: b.bookingNo,
    meta: `${b.projectCode} · unit ${b.unitNumber}`,
    lines: [
      { label: "Customer", value: `${b.customerName} · ${b.customerPhone}` },
      { label: "Booked", value: formatDate(b.bookingDate) },
      { label: "Collected", value: `${money(b.receivedAmount)} · ${pct}%` },
      { label: "Overdue", value: b.overdueAmount > 0 ? money(b.overdueAmount) : "—" },
      { label: "Sold by", value: b.soldBy ?? "—" },
    ],
    trailing: { value: money(b.totalAmount), label: "Value" },
    status: { label: b.status, tone: webTone(BOOKING_STATUS_TONE[b.status] ?? "slate") },
  };
}

export function bookingEmpty(filtered: boolean) {
  return filtered
    ? { title: "No bookings match", description: "Try a different search, status, project or date range." }
    : {
        title: "No bookings yet",
        description:
          "A booking starts from an approved cost sheet — it moves the unit off the board and " +
          "raises the payment schedule.",
      };
}
