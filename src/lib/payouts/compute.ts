/**
 * Payout arithmetic — SOW §3.4 — kept pure so every rupee can be asserted
 * without a database.
 *
 *   Final Payout = Total Payout − Advance − Bike Rental − TDS
 *
 * The formula is Admin's to edit (the `payout.formula` setting): each term is
 * a sign on a named column rather than free-text arithmetic. The sheet's own
 * figure for a deduction wins where the sheet has one; where it does not, the
 * system fills it from the approved advances and the running bike rent.
 */
import { matchColumns, numberText, valueOf, type ImportColumn } from "@/lib/import/columns";
import type { ParsedSheet } from "@/lib/import/parse";

export type FormulaTerm = "subtract" | "add" | "ignore";

export interface PayoutFormula {
  advance: FormulaTerm;
  bikeRental: FormulaTerm;
  tds: FormulaTerm;
  pullAdvancesFromSystem: boolean;
  pullBikeRentFromSystem: boolean;
}

/** Which column of a company's sheet carries each payout field. */
export interface PayoutColumnMap {
  riderCode: string;
  totalPayout: string;
  advance?: string;
  bikeRental?: string;
  tds?: string;
  finalPayout?: string;
}

export const PAYOUT_FIELDS = ["riderCode", "totalPayout", "advance", "bikeRental", "tds", "finalPayout"] as const;
export type PayoutField = (typeof PAYOUT_FIELDS)[number];

export const PAYOUT_FIELD_LABEL: Record<PayoutField, string> = {
  riderCode: "Rider ID",
  totalPayout: "Total payout",
  advance: "Advance",
  bikeRental: "Bike rental",
  tds: "TDS",
  finalPayout: "Final payout",
};

/** One row of a sheet, as read. A deduction the sheet did not carry is null. */
export interface SheetRow {
  /** The row number as the person sees it in their sheet (the header is row 1). */
  row: number;
  riderCode: string;
  totalPayout: number;
  advance: number | null;
  bikeRental: number | null;
  tds: number | null;
  /** What the sheet said the final was, for comparison; recomputed on posting. */
  finalPayout: number | null;
  raw: Record<string, string>;
  errors: string[];
}

export interface ParsedPayoutSheet {
  /** Required columns the file does not carry, by label. Nothing is read when any are missing. */
  missing: string[];
  /** The file's headers nothing reads. */
  ignored: string[];
  rows: SheetRow[];
}

/** The import columns a company's map implies — its own header names as the labels. */
export function payoutImportColumns(map: PayoutColumnMap): ImportColumn[] {
  const col = (key: PayoutField, required: boolean): ImportColumn | null => {
    const label = (map[key] ?? "").trim();
    if (!label) return null;
    return { key, label, required, aliases: [PAYOUT_FIELD_LABEL[key]] };
  };
  return [
    col("riderCode", true),
    col("totalPayout", true),
    col("advance", false),
    col("bikeRental", false),
    col("tds", false),
    col("finalPayout", false),
  ].filter((c): c is ImportColumn => c !== null);
}

function amount(raw: string): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (text === "" || text === "-" || text === "—") return { value: null, error: null };
  const n = Number(numberText(text));
  if (!Number.isFinite(n)) return { value: null, error: `"${raw}" is not a number` };
  return { value: Math.round(n * 100) / 100, error: null };
}

/** Reads a company's payout sheet by its column map. */
export function parsePayoutSheet(sheet: ParsedSheet, map: PayoutColumnMap): ParsedPayoutSheet {
  const columns = payoutImportColumns(map);
  const { mapping, missing, ignored } = matchColumns(sheet.headers, columns);
  if (missing.length) return { missing, ignored, rows: [] };

  const rows: SheetRow[] = sheet.rows.map((raw, i) => {
    const errors: string[] = [];
    const riderCode = valueOf(raw, mapping, "riderCode").replace(/\s+/g, "").toUpperCase();
    if (!riderCode) errors.push("Rider ID is blank");

    const read = (key: PayoutField, label: string, required = false) => {
      if (!mapping[key]) return null;
      const { value, error } = amount(valueOf(raw, mapping, key));
      if (error) errors.push(`${label}: ${error}`);
      else if (required && value === null) errors.push(`${label} is blank`);
      else if (value !== null && value < 0) errors.push(`${label} cannot be negative`);
      return value;
    };

    const totalPayout = read("totalPayout", map.totalPayout, true) ?? 0;
    return {
      row: i + 2,
      riderCode,
      totalPayout,
      advance: read("advance", map.advance ?? "Advance"),
      bikeRental: read("bikeRental", map.bikeRental ?? "Bike rental"),
      tds: read("tds", map.tds ?? "TDS"),
      finalPayout: read("finalPayout", map.finalPayout ?? "Final payout"),
      raw,
      errors,
    };
  });

  return { missing, ignored, rows };
}

export interface SystemDeductions {
  /** What the approved advances recover this period. */
  systemAdvance: number;
  /** The bike rent due for the period. */
  systemBikeRent: number;
}

export interface ComputedPayout {
  totalPayout: number;
  advance: number;
  bikeRental: number;
  tds: number;
  finalPayout: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function apply(total: number, term: FormulaTerm, value: number): number {
  if (term === "subtract") return total - value;
  if (term === "add") return total + value;
  return total;
}

/**
 * The final payout for one line.
 *
 * The sheet's figure for a deduction stands where it has one. Where the sheet
 * has none, the system's own figure fills it — and only when Admin has said
 * so in the formula. A term set to "ignore" is kept on the line, for the
 * record, but never touches the total. The result never goes below zero: a
 * deduction larger than the payout leaves the balance to be recovered next
 * time, not a negative payout.
 */
export function computeFinal(
  row: { totalPayout: number; advance: number | null; bikeRental: number | null; tds: number | null },
  formula: PayoutFormula,
  system: SystemDeductions,
): ComputedPayout {
  const advance = row.advance ?? (formula.pullAdvancesFromSystem ? system.systemAdvance : 0);
  const bikeRental = row.bikeRental ?? (formula.pullBikeRentFromSystem ? system.systemBikeRent : 0);
  const tds = row.tds ?? 0;

  let final = row.totalPayout;
  final = apply(final, formula.advance, advance);
  final = apply(final, formula.bikeRental, bikeRental);
  final = apply(final, formula.tds, tds);

  return {
    totalPayout: round2(row.totalPayout),
    advance: round2(advance),
    bikeRental: round2(bikeRental),
    tds: round2(tds),
    finalPayout: round2(Math.max(0, final)),
  };
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/**
 * The bike rent a rider owes for a period: the weekly rent times the whole
 * weeks each assignment overlaps it, with any overlap at all counting as one
 * week. An assignment with no end date runs on.
 */
export function bikeRentForPeriod(
  rents: Array<{ rentPerWeek: number; startDate: Date | string; endDate: Date | string | null }>,
  periodFrom: Date | string,
  periodTo: Date | string,
): number {
  const from = new Date(periodFrom).getTime();
  const to = new Date(periodTo).getTime() + DAY; // inclusive of the last day
  let total = 0;
  for (const r of rents) {
    const start = Math.max(from, new Date(r.startDate).getTime());
    const end = Math.min(to, r.endDate ? new Date(r.endDate).getTime() + DAY : to);
    if (end <= start) continue;
    const weeks = Math.max(1, Math.floor((end - start) / WEEK));
    total += r.rentPerWeek * weeks;
  }
  return round2(total);
}

/**
 * What the approved advances recover from this payout: each takes its
 * per-period amount, capped at what is still outstanding.
 */
export function advanceRecoveryForPeriod(
  advances: Array<{ status: string; amount: number; recoveredAmount: number; recoveryPerPeriod: number | null }>,
): { total: number; byAdvance: Array<{ index: number; amount: number }> } {
  const byAdvance: Array<{ index: number; amount: number }> = [];
  let total = 0;
  advances.forEach((a, index) => {
    if (a.status !== "APPROVED") return;
    const outstanding = round2(a.amount - a.recoveredAmount);
    if (outstanding <= 0) return;
    const take = round2(Math.min(a.recoveryPerPeriod ?? outstanding, outstanding));
    if (take <= 0) return;
    byAdvance.push({ index, amount: take });
    total += take;
  });
  return { total: round2(total), byAdvance };
}

/** Rider IDs match the way people type them: case and spaces do not count. */
export function riderCodeKey(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/**
 * The period a company's sheet most likely covers, from its cycle: the last
 * complete Monday–Sunday week, or the last calendar month. As yyyy-mm-dd.
 */
export function defaultPeriod(cycle: "WEEKLY" | "MONTHLY", nowMs: number): { from: string; to: string } {
  const now = new Date(nowMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (cycle === "MONTHLY") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: iso(first), to: iso(last) };
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(today.getTime() - dow * DAY);
  const lastMonday = new Date(thisMonday.getTime() - WEEK);
  const lastSunday = new Date(thisMonday.getTime() - DAY);
  return { from: iso(lastMonday), to: iso(lastSunday) };
}
