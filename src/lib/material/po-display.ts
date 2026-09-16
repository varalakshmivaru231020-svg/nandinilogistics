import { formatDayMonth } from "@/lib/utils";

/** How the design writes a purchase order's state, shared by the list and the detail. */
export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PENDING_PM_APPROVAL: "Pending PM approval",
  PENDING_ADMIN_APPROVAL: "Pending admin approval",
  APPROVED: "Approved · sent to vendor",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CLOSED: "Closed · matched",
  CANCELLED: "Cancelled",
};

export const PO_STATUS_TONE: Record<string, "muted" | "warn" | "good" | "brand" | "violet" | "bad"> = {
  DRAFT: "muted",
  PENDING_APPROVAL: "warn",
  PENDING_PM_APPROVAL: "warn",
  PENDING_ADMIN_APPROVAL: "violet",
  APPROVED: "brand",
  PARTIALLY_RECEIVED: "warn",
  RECEIVED: "good",
  CLOSED: "good",
  CANCELLED: "bad",
};

/** Which approval a pending order is waiting on, if any. */
export function pendingApproval(status: string): "PM" | "ADMIN" | null {
  if (status === "PENDING_PM_APPROVAL" || status === "PENDING_APPROVAL") return "PM";
  if (status === "PENDING_ADMIN_APPROVAL") return "ADMIN";
  return null;
}

/**
 * How the design writes a delivery: "Due 09 Sep" while it is coming, "Received
 * 28 Aug" once it has, "Late by 3 days" when the date has passed.
 */
export function deliveryLabel(
  expectedDate: Date | string | null,
  status: string,
  nowMs: number,
): { text: string; tone: "good" | "bad" | "plain" } {
  if (!expectedDate) return { text: "No date set", tone: "plain" };
  const due = new Date(expectedDate);
  const done = ["RECEIVED", "CLOSED"].includes(status);
  const day = formatDayMonth(due);
  if (done) return { text: `Received ${day}`, tone: "good" };
  const late = due.getTime() < nowMs && status !== "CANCELLED";
  if (late) {
    const days = Math.floor((nowMs - due.getTime()) / 86_400_000);
    return { text: `Late by ${days} day${days === 1 ? "" : "s"}`, tone: "bad" };
  }
  return { text: `Due ${day}`, tone: "plain" };
}
