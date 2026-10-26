import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import {
  ADVANCE_PRIORITY_LABEL, ADVANCE_PRIORITY_TONE, ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, bikeRentRunning,
} from "@/lib/advances/list-display";
import { employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";
import { advanceDecisions } from "@/lib/screens/rows/advance";
import { bikeRentDecisions } from "@/lib/screens/rows/bike-rent";

import type { RecordView } from "./shared";

/**
 * One advance request, with its decision and what has been recovered so far.
 * Scoped as the list is: a rider sees their own, a Team Leader the team's.
 */
export async function advanceRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);
  const a = await prisma.advance.findFirst({
    where: { id, employee: employeeScopeWhere(scope) },
    include: {
      employee: { select: { name: true, employeeCode: true, companies: { select: { company: { select: { name: true } } } } } },
      reason: { select: { name: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!a) return null;

  const amount = Number(a.amount);
  const recovered = Number(a.recoveredAmount);
  return {
    key: "advances",
    id: a.id,
    title: `${a.employee.name} · ₹${amount.toLocaleString("en-IN")}`,
    subtitle: `${a.employee.employeeCode} · ${a.employee.companies.map((c) => c.company.name).join(", ") || "—"}`,
    pills: [
      { label: ADVANCE_STATUS_LABEL[a.status] ?? a.status, tone: ADVANCE_STATUS_TONE[a.status] ?? "draft" },
      { label: ADVANCE_PRIORITY_LABEL[a.priority] ?? a.priority, tone: ADVANCE_PRIORITY_TONE[a.priority] ?? "draft" },
    ],
    sections: [
      {
        label: "The request",
        fields: [
          { label: "Amount", value: amount, format: "money" },
          { label: "Reason", value: a.reason?.name ?? null },
          { label: "Requested on", value: a.createdAt.toISOString(), format: "datetime" },
          { label: "Remarks", value: a.remarks, wide: true },
        ],
      },
      ...(a.status !== "PENDING"
        ? [{
            label: "The decision",
            fields: [
              { label: "Decided by", value: a.decidedBy?.name ?? null },
              { label: "Decided on", value: a.decidedAt?.toISOString() ?? null, format: "datetime" as const },
              { label: "Recovery per payout", value: a.recoveryPerPeriod === null ? null : Number(a.recoveryPerPeriod), format: "money" as const },
              { label: "Recovered so far", value: recovered, format: "money" as const },
              { label: "Outstanding", value: Math.max(0, amount - recovered), format: "money" as const },
              { label: "Remarks", value: a.decisionRemarks, wide: true },
            ],
          }]
        : []),
    ],
    collections: [],
    actions: advanceDecisions(
      { id: a.id, status: a.status, amount },
      { approve: ctx.has(PERM.advance.advance.approve), remove: ctx.has(PERM.advance.advance.delete) },
    ),
    serverTime: new Date().toISOString(),
  };
}

/** One bike assignment. */
export async function bikeRentRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);
  const r = await prisma.bikeRent.findFirst({
    where: { id, employee: employeeScopeWhere(scope) },
    include: { employee: { select: { name: true, employeeCode: true } } },
  });
  if (!r) return null;
  const today = new Date().toISOString().slice(0, 10);
  const running = bikeRentRunning(r.endDate, today);

  return {
    key: "advances/bike-rent",
    id: r.id,
    title: `${r.bikeNumber} · ${r.employee.name}`,
    subtitle: r.employee.employeeCode,
    pills: [running ? { label: "Running", tone: "info" } : { label: "Ended", tone: "draft" }],
    sections: [
      {
        label: "The assignment",
        fields: [
          { label: "Rent per week", value: Number(r.rentPerWeek), format: "money" },
          { label: "From", value: r.startDate.toISOString(), format: "date" },
          { label: "To", value: r.endDate?.toISOString() ?? null, format: "date" },
          { label: "Notes", value: r.notes, wide: true },
        ],
      },
    ],
    collections: [],
    actions: bikeRentDecisions(
      { id: r.id, endDate: r.endDate },
      today,
      { update: ctx.has(PERM.advance.bikeRent.update), remove: ctx.has(PERM.advance.bikeRent.delete) },
    ),
    serverTime: new Date().toISOString(),
  };
}
