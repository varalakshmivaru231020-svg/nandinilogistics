/**
 * The advance and bike rent screens' own words. Client-safe.
 */
import type { StatFigure } from "@/lib/metrics/figures";

export const ADVANCE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
export const ADVANCE_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "plum" | "info" | "draft"> = {
  PENDING: "warn",
  APPROVED: "good",
  REJECTED: "bad",
};
export const ADVANCE_PRIORITY_LABEL: Record<string, string> = { EMERGENCY: "Emergency", LOW: "Low priority" };
export const ADVANCE_PRIORITY_TONE: Record<string, "bad" | "draft"> = { EMERGENCY: "bad", LOW: "draft" };

export const ADVANCE_EMPTY_NONE = { title: "No advance requests yet." };
export const ADVANCE_EMPTY_FILTERED = { title: "No advance matches that filter." };
export const BIKE_RENT_EMPTY = { title: "No bike assigned yet." };

const num = (n: number) => n.toLocaleString("en-IN");
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export interface AdvanceFigures {
  pending: number;
  pendingAmount: number;
  approved: number;
  outstanding: number;
  rejected: number;
}

export function advanceSummaryOf(
  rows: Array<{ status: string; amount: unknown; recoveredAmount: unknown }>,
): AdvanceFigures {
  const n = (v: unknown) => Number(v ?? 0);
  const pending = rows.filter((r) => r.status === "PENDING");
  const approved = rows.filter((r) => r.status === "APPROVED");
  return {
    pending: pending.length,
    pendingAmount: pending.reduce((s, r) => s + n(r.amount), 0),
    approved: approved.length,
    outstanding: approved.reduce((s, r) => s + Math.max(0, n(r.amount) - n(r.recoveredAmount)), 0),
    rejected: rows.filter((r) => r.status === "REJECTED").length,
  };
}

export function advanceBandFigures(f: AdvanceFigures): StatFigure[] {
  return [
    { value: num(f.pending), label: "Waiting for a decision", hint: f.pending ? money(f.pendingAmount) : undefined, tone: f.pending > 0 ? "warn" : undefined },
    { value: num(f.approved), label: "Approved" },
    { value: money(f.outstanding), label: "Outstanding", tone: f.outstanding > 0 ? "brand" : undefined },
    { value: num(f.rejected), label: "Rejected" },
  ];
}

export interface BikeRentFigures {
  running: number;
  weeklyRent: number;
  ended: number;
}

export function bikeRentSummaryOf(
  rows: Array<{ rentPerWeek: unknown; endDate: Date | string | null }>,
  today: string,
): BikeRentFigures {
  const n = (v: unknown) => Number(v ?? 0);
  const t = new Date(`${today}T00:00:00.000Z`).getTime();
  const running = rows.filter((r) => !r.endDate || new Date(r.endDate).getTime() >= t);
  return {
    running: running.length,
    weeklyRent: running.reduce((s, r) => s + n(r.rentPerWeek), 0),
    ended: rows.length - running.length,
  };
}

export function bikeRentBandFigures(f: BikeRentFigures): StatFigure[] {
  return [
    { value: num(f.running), label: "Bikes on rent", tone: f.running > 0 ? "brand" : undefined },
    { value: money(f.weeklyRent), label: "Rent per week" },
    { value: num(f.ended), label: "Ended" },
  ];
}

/** Whether an assignment is still running on `today`. */
export function bikeRentRunning(endDate: Date | string | null, today: string): boolean {
  return !endDate || new Date(endDate).getTime() >= new Date(`${today}T00:00:00.000Z`).getTime();
}
