/**
 * The payout screens' own words: status tones, empty lines and the band each
 * opens with. Client-safe, because the web screen and the row the phone is
 * sent both read these.
 */
import type { StatFigure } from "@/lib/metrics/figures";

export const PAYOUT_STATUS_LABEL: Record<string, string> = { PAID: "Paid", HOLD: "On hold" };
export const PAYOUT_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "plum" | "info" | "draft"> = {
  PAID: "good",
  HOLD: "warn",
};

export const IMPORT_STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted" };
export const IMPORT_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "plum" | "info" | "draft"> = {
  DRAFT: "draft",
  POSTED: "good",
};

export const PAYOUT_EMPTY_NONE = { title: "No payouts posted yet — import a company's sheet and post it." };
export const PAYOUT_EMPTY_FILTERED = { title: "No payout line matches that filter." };
export const IMPORT_EMPTY = { title: "No payout sheets imported yet." };

const num = (n: number) => n.toLocaleString("en-IN");
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export interface PayoutLineFigures {
  totalPayout: number;
  deductions: number;
  finalPayout: number;
  held: number;
  heldAmount: number;
  riders: number;
}

/** The figures, from the lines a list already holds. */
export function payoutSummaryOf(
  lines: Array<{ employeeId: string | null; totalPayout: unknown; advance: unknown; bikeRental: unknown; tds: unknown; finalPayout: unknown; status: string }>,
): PayoutLineFigures {
  const n = (v: unknown) => Number(v ?? 0);
  const held = lines.filter((l) => l.status === "HOLD");
  return {
    totalPayout: lines.reduce((s, l) => s + n(l.totalPayout), 0),
    deductions: lines.reduce((s, l) => s + n(l.advance) + n(l.bikeRental) + n(l.tds), 0),
    finalPayout: lines.reduce((s, l) => s + n(l.finalPayout), 0),
    held: held.length,
    heldAmount: held.reduce((s, l) => s + n(l.finalPayout), 0),
    riders: new Set(lines.map((l) => l.employeeId ?? "?")).size,
  };
}

/** The band the payout list opens with. */
export function payoutBandFigures(f: PayoutLineFigures): StatFigure[] {
  return [
    { value: num(f.riders), label: "Riders" },
    { value: money(f.totalPayout), label: "Total payout" },
    { value: money(f.deductions), label: "Deductions" },
    { value: money(f.finalPayout), label: "Final payout", tone: "good" },
    { value: num(f.held), label: "On hold", hint: f.held ? money(f.heldAmount) : undefined, tone: f.held > 0 ? "warn" : undefined },
  ];
}

export interface ImportFigures {
  imports: number;
  drafts: number;
  unmatched: number;
  posted: number;
}

export function importSummaryOf(
  imports: Array<{ status: string; lines: Array<{ employeeId: string | null }> }>,
): ImportFigures {
  return {
    imports: imports.length,
    drafts: imports.filter((i) => i.status === "DRAFT").length,
    unmatched: imports.filter((i) => i.status === "DRAFT").reduce((s, i) => s + i.lines.filter((l) => !l.employeeId).length, 0),
    posted: imports.filter((i) => i.status === "POSTED").length,
  };
}

export function importBandFigures(f: ImportFigures): StatFigure[] {
  return [
    { value: num(f.imports), label: "Sheets imported" },
    { value: num(f.drafts), label: "Awaiting posting", tone: f.drafts > 0 ? "warn" : undefined },
    { value: num(f.unmatched), label: "Unmatched rows", tone: f.unmatched > 0 ? "bad" : undefined },
    { value: num(f.posted), label: "Posted", tone: f.posted > 0 ? "good" : undefined },
  ];
}
