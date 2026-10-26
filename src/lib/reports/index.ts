import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { referralStatus } from "@/lib/riders/referrals";

import { dateCondition, filterSpecFor, type ReportFilters } from "./filters";
import type { ReportDef, ReportResult } from "./types";

/**
 * The report catalogue — the SOW's §3.5 reports, plus the tele-caller's daily
 * summary (§3.8). Each entry's permission is `reports.<key>.view`, which the
 * permission registry declares; this file supplies the query.
 */
export const REPORTS: ReportDef[] = [
  { key: "teamLeader", label: "TL report — active riders per Team Leader", audience: "Admin", description: "Active riders under each Team Leader, by company; joined this week and this month; left this month." },
  { key: "ridersByCompany", label: "Riders by company", audience: "Admin", description: "Every rider deployed to a company, with status, Rider ID and joining date." },
  { key: "leadConversion", label: "Lead conversion", audience: "Admin", description: "Leads captured per tele-caller, where they stand, and how many reached onboarding or were lost." },
  { key: "payoutSummary", label: "Payout summary", audience: "Admin", description: "Posted payouts per company and period — total, deductions, final, and what is on hold." },
  { key: "advanceOutstanding", label: "Advance outstanding", audience: "Admin", description: "Approved advances against what has been recovered, per rider." },
  { key: "teleCallerDaily", label: "Tele-caller daily summary", audience: "Tele-caller", description: "Calls logged, leads moved per stage and onboardings completed, per tele-caller per day." },
];

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

const num = (v: unknown) => Number(v ?? 0);
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const DAY = 86_400_000;

export async function runReport(
  key: string,
  ctx: AuthContext,
  filters: ReportFilters = {},
): Promise<ReportResult> {
  const spec = filterSpecFor(key);
  const companyScope = spec.company && filters.companyId ? { companyId: filters.companyId } : {};
  const range = spec.date ? dateCondition(filters) : undefined;
  const during = (field: string): Record<string, unknown> => (range ? { [field]: range } : {});
  const now = new Date();

  switch (key) {
    /* --------------------------------- TL report --------------------------- */
    case "teamLeader": {
      const leaderIds = await usersHolding(prisma, PERM.task.task.start);
      const leaders = await prisma.user.findMany({
        where: { id: { in: leaderIds }, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true,
          companiesLed: {
            where: filters.companyId ? { companyId: filters.companyId } : {},
            select: { company: { select: { id: true, name: true } } },
          },
        },
      });
      const weekAgo = new Date(now.getTime() - 7 * DAY);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const rows: Array<Record<string, unknown>> = [];
      for (const tl of leaders) {
        for (const led of tl.companiesLed) {
          const base = { companies: { some: { companyId: led.company.id } }, onboardingStatus: "ACCEPTED" as const };
          const [active, joinedWeek, joinedMonth, leftMonth] = await Promise.all([
            prisma.employee.count({ where: { ...base, status: "ACTIVE" } }),
            prisma.employee.count({ where: { ...base, joinedOn: { gte: weekAgo } } }),
            prisma.employee.count({ where: { ...base, joinedOn: { gte: monthStart } } }),
            prisma.employee.count({ where: { ...base, status: "INACTIVE", leftOn: { gte: monthStart } } }),
          ]);
          rows.push({ teamLeader: tl.name, company: led.company.name, active, joinedWeek, joinedMonth, leftMonth });
        }
        if (tl.companiesLed.length === 0 && !filters.companyId) {
          rows.push({ teamLeader: tl.name, company: "— no company assigned —", active: 0, joinedWeek: 0, joinedMonth: 0, leftMonth: 0 });
        }
      }

      return {
        columns: [
          { key: "teamLeader", header: "Team Leader" },
          { key: "company", header: "Company" },
          { key: "active", header: "Active riders", align: "right", format: "number" },
          { key: "joinedWeek", header: "Joined this week", align: "right", format: "number" },
          { key: "joinedMonth", header: "Joined this month", align: "right", format: "number" },
          { key: "leftMonth", header: "Left this month", align: "right", format: "number" },
        ],
        rows,
        summary: [
          { label: "Team Leaders", value: String(leaders.length) },
          { label: "Active riders", value: String(rows.reduce((s, r) => s + num(r.active), 0)) },
        ],
        emptyMessage: "No Team Leader is assigned to a company yet.",
      };
    }

    /* ---------------------------- Riders by company ------------------------ */
    case "ridersByCompany": {
      const riders = await prisma.employee.findMany({
        where: {
          onboardingStatus: "ACCEPTED",
          companies: filters.companyId ? { some: { companyId: filters.companyId } } : { some: {} },
          ...during("joinedOn"),
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          employeeCode: true, name: true, mobile: true, status: true, joinedOn: true, leftOn: true,
          companies: { select: { company: { select: { name: true } } } },
          employmentType: { select: { name: true } },
        },
      });
      const rows = riders.flatMap((r) =>
        r.companies
          .filter((c) => !filters.companyId || true)
          .map((c) => ({
            company: c.company.name,
            riderId: r.employeeCode,
            name: r.name,
            mobile: ctx.has(PERM.hr.employee.viewIdentity) ? r.mobile : "••••••" + r.mobile.slice(-4),
            type: r.employmentType.name,
            status: r.status === "ACTIVE" ? "Active" : "Left",
            joinedOn: r.joinedOn,
            leftOn: r.leftOn,
          })),
      ).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
      return {
        columns: [
          { key: "company", header: "Company" },
          { key: "riderId", header: "Rider ID" },
          { key: "name", header: "Name" },
          { key: "mobile", header: "Mobile" },
          { key: "type", header: "Type" },
          { key: "status", header: "Status", align: "center", format: "badge" },
          { key: "joinedOn", header: "Joined", format: "date" },
          { key: "leftOn", header: "Left", format: "date" },
        ],
        rows,
        summary: [
          { label: "Riders", value: String(riders.length) },
          { label: "Active", value: String(riders.filter((r) => r.status === "ACTIVE").length), tone: "good" },
        ],
        emptyMessage: "No riders are deployed yet.",
      };
    }

    /* ------------------------------ Lead conversion ------------------------ */
    case "leadConversion": {
      const leads = await prisma.lead.findMany({
        where: {
          ...during("createdAt"),
          ...(filters.companyId ? { companies: { some: { companyId: filters.companyId } } } : {}),
        },
        select: { ownerId: true, owner: { select: { name: true } }, stage: { select: { name: true, kind: true } } },
      });
      const by = new Map<string, { owner: string; total: number; open: number; onboarding: number; lost: number }>();
      for (const l of leads) {
        const k = l.ownerId ?? "—";
        const row = by.get(k) ?? { owner: l.owner?.name ?? "Unassigned", total: 0, open: 0, onboarding: 0, lost: 0 };
        row.total += 1;
        if (l.stage.kind === "ONBOARDING") row.onboarding += 1;
        else if (l.stage.kind === "LOST") row.lost += 1;
        else row.open += 1;
        by.set(k, row);
      }
      const rows = [...by.values()]
        .sort((a, b) => b.total - a.total)
        .map((r) => ({ ...r, conversion: r.total ? Math.round((r.onboarding / r.total) * 100) : 0 }));
      return {
        columns: [
          { key: "owner", header: "Tele-caller" },
          { key: "total", header: "Leads", align: "right", format: "number" },
          { key: "open", header: "In pipeline", align: "right", format: "number" },
          { key: "onboarding", header: "Onboarding", align: "right", format: "number" },
          { key: "lost", header: "Lost", align: "right", format: "number" },
          { key: "conversion", header: "Conversion", align: "right", format: "percent" },
        ],
        rows,
        summary: [
          { label: "Leads", value: String(leads.length) },
          { label: "Reached onboarding", value: String(rows.reduce((s, r) => s + r.onboarding, 0)), tone: "good" },
          { label: "Lost", value: String(rows.reduce((s, r) => s + r.lost, 0)), tone: "bad" },
        ],
        emptyMessage: "No leads in this range.",
      };
    }

    /* ------------------------------ Payout summary ------------------------- */
    case "payoutSummary": {
      const imports = await prisma.payoutImport.findMany({
        where: { status: "POSTED", ...companyScope, ...during("periodFrom") },
        orderBy: [{ periodFrom: "desc" }],
        select: {
          periodFrom: true, periodTo: true, postedAt: true,
          company: { select: { name: true } },
          lines: { select: { totalPayout: true, advance: true, bikeRental: true, tds: true, finalPayout: true, status: true } },
        },
      });
      const rows = imports.map((i) => {
        const sum = (f: "totalPayout" | "advance" | "bikeRental" | "tds" | "finalPayout") =>
          i.lines.reduce((s, l) => s + num(l[f]), 0);
        const held = i.lines.filter((l) => l.status === "HOLD");
        return {
          company: i.company.name,
          periodFrom: i.periodFrom,
          periodTo: i.periodTo,
          riders: i.lines.length,
          total: sum("totalPayout"),
          advance: sum("advance"),
          bikeRental: sum("bikeRental"),
          tds: sum("tds"),
          finalPayout: sum("finalPayout"),
          held: held.length,
          heldAmount: held.reduce((s, l) => s + num(l.finalPayout), 0),
        };
      });
      return {
        columns: [
          { key: "company", header: "Company" },
          { key: "periodFrom", header: "From", format: "date" },
          { key: "periodTo", header: "To", format: "date" },
          { key: "riders", header: "Riders", align: "right", format: "number" },
          { key: "total", header: "Total payout", align: "right", format: "money" },
          { key: "advance", header: "Advance", align: "right", format: "money" },
          { key: "bikeRental", header: "Bike rent", align: "right", format: "money" },
          { key: "tds", header: "TDS", align: "right", format: "money" },
          { key: "finalPayout", header: "Final payout", align: "right", format: "money" },
          { key: "held", header: "On hold", align: "right", format: "number" },
          { key: "heldAmount", header: "Held amount", align: "right", format: "money" },
        ],
        rows,
        summary: [
          { label: "Final payout", value: inr(rows.reduce((s, r) => s + r.finalPayout, 0)) },
          { label: "On hold", value: inr(rows.reduce((s, r) => s + r.heldAmount, 0)), tone: "warn" },
        ],
        emptyMessage: "No payouts posted in this range.",
      };
    }

    /* ---------------------------- Advance outstanding ---------------------- */
    case "advanceOutstanding": {
      const advances = await prisma.advance.findMany({
        where: { status: "APPROVED", ...during("decidedAt") },
        select: {
          amount: true, recoveredAmount: true, recoveryPerPeriod: true, decidedAt: true, priority: true,
          employee: {
            select: {
              employeeCode: true, name: true,
              companies: { select: { company: { select: { name: true } } } },
            },
          },
        },
      });
      const rows = advances
        .map((a) => ({
          riderId: a.employee.employeeCode,
          name: a.employee.name,
          company: a.employee.companies.map((c) => c.company.name).join(", "),
          priority: a.priority === "EMERGENCY" ? "Emergency" : "Low priority",
          approvedOn: a.decidedAt,
          amount: num(a.amount),
          recovered: num(a.recoveredAmount),
          outstanding: Math.max(0, num(a.amount) - num(a.recoveredAmount)),
          perPeriod: num(a.recoveryPerPeriod),
        }))
        .filter((r) => r.outstanding > 0 && (!filters.companyId || true))
        .sort((a, b) => b.outstanding - a.outstanding);
      return {
        columns: [
          { key: "riderId", header: "Rider ID" },
          { key: "name", header: "Name" },
          { key: "company", header: "Company" },
          { key: "priority", header: "Priority" },
          { key: "approvedOn", header: "Approved", format: "date" },
          { key: "amount", header: "Advance", align: "right", format: "money" },
          { key: "recovered", header: "Recovered", align: "right", format: "money" },
          { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
          { key: "perPeriod", header: "Per payout", align: "right", format: "money" },
        ],
        rows,
        summary: [
          { label: "Outstanding", value: inr(rows.reduce((s, r) => s + r.outstanding, 0)), tone: "warn" },
          { label: "Riders", value: String(new Set(rows.map((r) => r.riderId)).size) },
        ],
        emptyMessage: "Nothing outstanding.",
      };
    }

    /* --------------------------- Tele-caller daily ------------------------- */
    case "teleCallerDaily": {
      const scope = ctx.has(PERM.sales.lead.viewAll) ? {} : { userId: ctx.id };
      const [followUps, onboarded] = await Promise.all([
        prisma.leadFollowUp.findMany({
          where: { ...scope, ...during("completedAt") },
          select: { userId: true, completedAt: true, channel: true, stageId: true, user: { select: { name: true } } },
        }),
        prisma.employee.findMany({
          where: { onboardingStatus: "ACCEPTED", ...during("decidedAt"), leadId: { not: null } },
          select: { decidedAt: true, lead: { select: { ownerId: true } } },
        }),
      ]);
      const dayOf = (d: Date) => d.toISOString().slice(0, 10);
      const by = new Map<string, { teleCaller: string; day: string; calls: number; moves: number; onboardings: number }>();
      for (const f of followUps) {
        const k = `${f.userId}|${dayOf(f.completedAt)}`;
        const row = by.get(k) ?? { teleCaller: f.user.name, day: dayOf(f.completedAt), calls: 0, moves: 0, onboardings: 0 };
        if (f.channel === "CALL") row.calls += 1;
        if (f.stageId) row.moves += 1;
        by.set(k, row);
      }
      for (const e of onboarded) {
        if (!e.decidedAt || !e.lead?.ownerId) continue;
        const k = `${e.lead.ownerId}|${dayOf(e.decidedAt)}`;
        const row = by.get(k) ?? { teleCaller: "", day: dayOf(e.decidedAt), calls: 0, moves: 0, onboardings: 0 };
        row.onboardings += 1;
        by.set(k, row);
      }
      const rows = [...by.values()].sort((a, b) => b.day.localeCompare(a.day) || a.teleCaller.localeCompare(b.teleCaller));
      return {
        columns: [
          { key: "day", header: "Day", format: "date" },
          { key: "teleCaller", header: "Tele-caller" },
          { key: "calls", header: "Calls logged", align: "right", format: "number" },
          { key: "moves", header: "Stage moves", align: "right", format: "number" },
          { key: "onboardings", header: "Onboardings", align: "right", format: "number" },
        ],
        rows,
        summary: [
          { label: "Calls", value: String(rows.reduce((s, r) => s + r.calls, 0)) },
          { label: "Onboardings", value: String(rows.reduce((s, r) => s + r.onboardings, 0)), tone: "good" },
        ],
        emptyMessage: "No activity in this range.",
      };
    }

    default:
      throw new Error(`Unknown report: ${key}`);
  }
}

// referralStatus is re-exported for the referral screen's convenience.
export { referralStatus };
