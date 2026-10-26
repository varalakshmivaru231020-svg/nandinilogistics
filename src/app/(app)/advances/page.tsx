import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { advanceListWhere, readAdvanceListParams } from "@/lib/advances/list-filters";
import { advanceSummaryOf } from "@/lib/advances/list-display";
import { describeScope, employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";
import { AdvancesScreen } from "./advances-screen";

export const metadata = { title: "Advances" };

/**
 * Advance requests — SOW §3.5. A rider asks from the app; a Team Leader or
 * Admin approves with a recovery schedule or rejects with a reason.
 */
export default async function AdvancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.advance.advance.view);
  const params = readAdvanceListParams(await searchParams);
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);

  const [advances, companies, reasons, riders] = await Promise.all([
    prisma.advance.findMany({
      where: advanceListWhere(scope, params),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, amount: true, priority: true, remarks: true, status: true, recoveredAmount: true,
        recoveryPerPeriod: true, createdAt: true, decidedAt: true, decisionRemarks: true,
        reason: { select: { name: true } },
        decidedBy: { select: { name: true } },
        employee: {
          select: { id: true, name: true, employeeCode: true, companies: { select: { company: { select: { name: true } } } } },
        },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.advanceReason.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.has(PERM.advance.advance.create)
      ? prisma.employee.findMany({
          where: { onboardingStatus: "ACCEPTED", status: "ACTIVE", ...employeeScopeWhere(scope) },
          orderBy: { name: "asc" },
          select: { id: true, name: true, employeeCode: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <AdvancesScreen
      advances={advances.map((a) => ({
        id: a.id,
        riderId: a.employee.id,
        riderCode: a.employee.employeeCode,
        riderName: a.employee.name,
        companies: a.employee.companies.map((c) => c.company.name).join(", "),
        amount: Number(a.amount),
        priority: a.priority,
        reason: a.reason?.name ?? null,
        remarks: a.remarks,
        status: a.status,
        recoveredAmount: Number(a.recoveredAmount),
        recoveryPerPeriod: a.recoveryPerPeriod === null ? null : Number(a.recoveryPerPeriod),
        requestedAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
        decidedBy: a.decidedBy?.name ?? null,
        decisionRemarks: a.decisionRemarks,
      }))}
      summary={advanceSummaryOf(advances)}
      companies={companies}
      reasons={reasons}
      riders={riders.map((r) => ({ id: r.id, label: `${r.employeeCode} — ${r.name}` }))}
      picked={{ status: params.status, priority: params.priority, company: params.company }}
      q={params.q}
      scopeWords={describeScope(scope)}
      can={{
        create: ctx.has(PERM.advance.advance.create),
        approve: ctx.has(PERM.advance.advance.approve),
        delete: ctx.has(PERM.advance.advance.delete),
        export: ctx.has(PERM.advance.advance.export),
      }}
    />
  );
}
