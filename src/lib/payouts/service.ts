import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { ParsedSheet } from "@/lib/import/parse";
import { getSetting } from "@/lib/settings";

import {
  advanceRecoveryForPeriod, bikeRentForPeriod, computeFinal, parsePayoutSheet, riderCodeKey,
  type PayoutColumnMap, type SheetRow,
} from "./compute";

type Tx = Prisma.TransactionClient | PrismaClient;

/** The Internal Staff company: its sheet is matched to internal staff, not to deployed riders. */
export const INTERNAL_COMPANY_CODE = "INTERNAL";
export const INTERNAL_STAFF_TYPE = "Internal Staff";

export class PayoutError extends Error {}

export interface PlannedLine extends SheetRow {
  employeeId: string | null;
  employeeName: string | null;
}

export interface ImportPlan {
  company: { id: string; name: string; code: string };
  missing: string[];
  ignored: string[];
  lines: PlannedLine[];
  matched: number;
  unmatched: number;
  invalid: number;
}

/** The people a company's sheet may name, by Rider ID. */
async function matchable(tx: Tx, company: { id: string; code: string }) {
  const where =
    company.code === INTERNAL_COMPANY_CODE
      ? { employmentType: { name: INTERNAL_STAFF_TYPE } }
      : { companies: { some: { companyId: company.id } } };
  const people = await tx.employee.findMany({
    where: { ...where, onboardingStatus: "ACCEPTED" },
    select: { id: true, name: true, employeeCode: true },
  });
  return new Map(people.map((p) => [riderCodeKey(p.employeeCode), p]));
}

/**
 * Reads a sheet against a company's column map and matches each row to a
 * rider deployed to that company. Unmatched rows are kept, with no employee,
 * for correction before posting.
 */
export async function planImport(
  tx: Tx,
  companyId: string,
  periodFrom: Date,
  periodTo: Date,
  sheet: ParsedSheet,
): Promise<ImportPlan> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, code: true, payoutColumnMap: true, status: true },
  });
  if (!company || company.status !== "ACTIVE") throw new PayoutError("Choose an active company.");
  if (periodTo.getTime() < periodFrom.getTime()) throw new PayoutError("The period ends before it starts.");

  const map = (company.payoutColumnMap ?? null) as PayoutColumnMap | null;
  if (!map || !map.riderCode || !map.totalPayout) {
    throw new PayoutError(`${company.name} has no payout column mapping yet — set it on the company first.`);
  }

  const parsed = parsePayoutSheet(sheet, map);
  const people = await matchable(tx, company);

  const lines: PlannedLine[] = parsed.rows.map((r) => {
    const hit = people.get(riderCodeKey(r.riderCode));
    return { ...r, employeeId: hit?.id ?? null, employeeName: hit?.name ?? null };
  });

  return {
    company: { id: company.id, name: company.name, code: company.code },
    missing: parsed.missing,
    ignored: parsed.ignored,
    lines,
    matched: lines.filter((l) => l.employeeId && l.errors.length === 0).length,
    unmatched: lines.filter((l) => !l.employeeId && l.errors.length === 0).length,
    invalid: lines.filter((l) => l.errors.length > 0).length,
  };
}

/** Writes a planned import as a draft. Rows with errors are not written. */
export async function createImport(
  tx: Tx,
  plan: ImportPlan,
  periodFrom: Date,
  periodTo: Date,
  fileName: string,
  uploadedById: string,
): Promise<{ id: string; lines: number }> {
  if (plan.missing.length) throw new PayoutError(`The sheet has no ${plan.missing.join(", ")} column.`);
  const usable = plan.lines.filter((l) => l.errors.length === 0);
  if (usable.length === 0) throw new PayoutError("No usable rows in the sheet.");

  const imp = await tx.payoutImport.create({
    data: {
      companyId: plan.company.id,
      periodFrom,
      periodTo,
      fileName,
      uploadedById,
      lines: {
        create: usable.map((l) => ({
          riderCode: l.riderCode,
          employeeId: l.employeeId,
          totalPayout: l.totalPayout,
          advance: l.advance ?? 0,
          bikeRental: l.bikeRental ?? 0,
          tds: l.tds ?? 0,
          finalPayout: l.finalPayout ?? Math.max(0, l.totalPayout - (l.advance ?? 0) - (l.bikeRental ?? 0) - (l.tds ?? 0)),
          raw: l.raw,
        })),
      },
    },
    select: { id: true },
  });
  return { id: imp.id, lines: usable.length };
}

/** Points an unmatched line at a rider. Only on a draft, only to someone the sheet could name. */
export async function correctLine(tx: Tx, lineId: string, employeeId: string): Promise<void> {
  const line = await tx.payoutLine.findUnique({
    where: { id: lineId },
    select: { id: true, import: { select: { status: true, company: { select: { id: true, code: true } } } } },
  });
  if (!line) throw new PayoutError("That line is not on any sheet.");
  if (line.import.status !== "DRAFT") throw new PayoutError("A posted sheet cannot be corrected.");
  const people = await matchable(tx, line.import.company);
  const hit = [...people.values()].find((p) => p.id === employeeId);
  if (!hit) throw new PayoutError("That person is not deployed to this company.");
  await tx.payoutLine.update({ where: { id: lineId }, data: { employeeId: hit.id } });
}

/**
 * Posts a draft: every line must be matched; the finals are recomputed from
 * the formula and the system's own advances and bike rent for the period;
 * the advances deducted are marked recovered; the riders and the company's
 * Team Leaders are told.
 */
export async function postImport(tx: Tx, importId: string, userId: string): Promise<{ lines: number; deducted: number }> {
  const imp = await tx.payoutImport.findUnique({
    where: { id: importId },
    include: { lines: true, company: { select: { id: true, name: true } } },
  });
  if (!imp) throw new PayoutError("That sheet does not exist.");
  if (imp.status === "POSTED") throw new PayoutError("This sheet is already posted.");
  const unmatched = imp.lines.filter((l) => !l.employeeId);
  if (unmatched.length) {
    throw new PayoutError(`${unmatched.length} row${unmatched.length === 1 ? "" : "s"} still unmatched — match every Rider ID before posting.`);
  }

  const formula = await getSetting(tx, "payout.formula");
  const employeeIds = imp.lines.map((l) => l.employeeId!);

  const [advances, rents] = await Promise.all([
    tx.advance.findMany({
      where: { employeeId: { in: employeeIds }, status: "APPROVED" },
      orderBy: { decidedAt: "asc" },
      select: { id: true, employeeId: true, status: true, amount: true, recoveredAmount: true, recoveryPerPeriod: true },
    }),
    tx.bikeRent.findMany({
      where: { employeeId: { in: employeeIds }, startDate: { lte: imp.periodTo }, OR: [{ endDate: null }, { endDate: { gte: imp.periodFrom } }] },
      select: { employeeId: true, rentPerWeek: true, startDate: true, endDate: true },
    }),
  ]);

  let deducted = 0;
  for (const line of imp.lines) {
    const mine = advances.filter((a) => a.employeeId === line.employeeId);
    const recovery = advanceRecoveryForPeriod(
      mine.map((a) => ({ status: a.status, amount: Number(a.amount), recoveredAmount: Number(a.recoveredAmount), recoveryPerPeriod: a.recoveryPerPeriod === null ? null : Number(a.recoveryPerPeriod) })),
    );
    const rent = bikeRentForPeriod(
      rents.filter((r) => r.employeeId === line.employeeId).map((r) => ({ rentPerWeek: Number(r.rentPerWeek), startDate: r.startDate, endDate: r.endDate })),
      imp.periodFrom,
      imp.periodTo,
    );

    // The sheet's own figure stands where the sheet carried one; a line whose
    // raw row had no value for the column is filled from the system.
    const raw = (line.raw ?? {}) as Record<string, string>;
    const hadColumn = (field: "advance" | "bikeRental" | "tds") => sheetCarried(raw, field, Number(line[field]));

    const computed = computeFinal(
      {
        totalPayout: Number(line.totalPayout),
        advance: hadColumn("advance") ? Number(line.advance) : null,
        bikeRental: hadColumn("bikeRental") ? Number(line.bikeRental) : null,
        tds: hadColumn("tds") ? Number(line.tds) : null,
      },
      formula,
      { systemAdvance: recovery.total, systemBikeRent: rent },
    );

    await tx.payoutLine.update({
      where: { id: line.id },
      data: {
        advance: computed.advance,
        bikeRental: computed.bikeRental,
        tds: computed.tds,
        finalPayout: computed.finalPayout,
      },
    });

    // What the system recovered is recorded on each advance, so the next
    // payout starts from what is still outstanding.
    if (!hadColumn("advance") && formula.pullAdvancesFromSystem && formula.advance === "subtract") {
      for (const take of recovery.byAdvance) {
        await tx.advance.update({
          where: { id: mine[take.index].id },
          data: { recoveredAmount: { increment: take.amount } },
        });
        deducted += take.amount;
      }
    }
  }

  await tx.payoutImport.update({
    where: { id: importId },
    data: { status: "POSTED", postedById: userId, postedAt: new Date() },
  });

  // Tell the riders who have a login, and the company's Team Leaders.
  const [riders, leaders] = await Promise.all([
    tx.employee.findMany({ where: { id: { in: employeeIds }, userId: { not: null } }, select: { userId: true } }),
    tx.companyTeamLeader.findMany({ where: { companyId: imp.companyId }, select: { userId: true } }),
  ]);
  const period = `${imp.periodFrom.toISOString().slice(0, 10)} – ${imp.periodTo.toISOString().slice(0, 10)}`;
  const recipients = new Set<string>([
    ...riders.map((r) => r.userId!),
    ...leaders.map((l) => l.userId),
  ]);
  recipients.delete(userId);
  if (recipients.size) {
    await tx.notification.createMany({
      data: [...recipients].map((uid) => ({
        userId: uid,
        kind: "PAYOUT_POSTED",
        title: `Payout posted — ${imp.company.name}`,
        body: `Period ${period}.`,
        href: "/payouts",
        entity: "PayoutImport",
        entityId: importId,
      })),
    });
  }

  return { lines: imp.lines.length, deducted: Math.round(deducted * 100) / 100 };
}

/**
 * Whether the sheet actually carried a figure for a deduction: the raw row
 * has a header whose value is a number. A blank cell, or no such column, is
 * the system's to fill.
 */
function sheetCarried(raw: Record<string, string>, field: "advance" | "bikeRental" | "tds", stored: number): boolean {
  const words: Record<typeof field, RegExp> = {
    advance: /advance/i,
    bikeRental: /bike|rent/i,
    tds: /tds|deduction/i,
  };
  const header = Object.keys(raw).find((h) => words[field].test(h));
  if (!header) return false;
  const value = (raw[header] ?? "").trim();
  if (value === "" || value === "-" || value === "—") return false;
  return Number.isFinite(stored);
}

export async function holdLine(tx: Tx, lineId: string, reason: string): Promise<void> {
  const line = await tx.payoutLine.findUnique({ where: { id: lineId }, select: { status: true } });
  if (!line) throw new PayoutError("That payout line does not exist.");
  if (!reason.trim()) throw new PayoutError("Give a reason for the hold.");
  await tx.payoutLine.update({ where: { id: lineId }, data: { status: "HOLD", holdReason: reason.trim() } });
}

export async function releaseLine(tx: Tx, lineId: string): Promise<void> {
  const line = await tx.payoutLine.findUnique({ where: { id: lineId }, select: { status: true } });
  if (!line) throw new PayoutError("That payout line does not exist.");
  await tx.payoutLine.update({ where: { id: lineId }, data: { status: "PAID", holdReason: null } });
}
