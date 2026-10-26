import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { ADVANCE_EMPTY_FILTERED, ADVANCE_EMPTY_NONE, advanceDecisions, advanceScreenRow } from "@/lib/screens/rows/advance";
import { advanceBandFigures, advanceSummaryOf } from "@/lib/advances/list-display";
import { advanceListWhere, describeAdvanceFilters, readAdvanceListParams } from "@/lib/advances/list-filters";
import { describeScope, resolveViewerScope } from "@/lib/payouts/scope";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/** Every advance request in the viewer's scope, as the screen narrows it. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.advance.advance.view, PERM.advance.advance.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readAdvanceListParams(gate.params);
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);

  const [advances, company] = await Promise.all([
    prisma.advance.findMany({
      where: advanceListWhere(scope, params),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, amount: true, priority: true, remarks: true, status: true, recoveredAmount: true,
        recoveryPerPeriod: true, createdAt: true, decidedAt: true, decisionRemarks: true,
        reason: { select: { name: true } },
        decidedBy: { select: { name: true } },
        employee: { select: { name: true, employeeCode: true, companies: { select: { company: { select: { name: true } } } } } },
      },
    }),
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(advances);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const can = { approve: ctx.has(PERM.advance.advance.approve), remove: ctx.has(PERM.advance.advance.delete) };
    screen = {
      rows: rows.slice(from, to).map((a) =>
        advanceScreenRow(
          {
            id: a.id,
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
            requestedAt: a.createdAt,
            decidedBy: a.decidedBy?.name ?? null,
            decisionRemarks: a.decisionRemarks,
          },
          advanceDecisions({ id: a.id, status: a.status, amount: Number(a.amount) }, can),
        ),
      ),
      band: bandOf(advanceBandFigures(advanceSummaryOf(advances))),
      empty: rows.length === 0 ? ADVANCE_EMPTY_NONE : ADVANCE_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "riderCode", header: "Rider ID" },
    { key: "rider", header: "Rider" },
    { key: "companies", header: "Companies" },
    { key: "amount", header: "Amount", align: "right", format: "money" },
    { key: "priority", header: "Priority" },
    { key: "reason", header: "Reason" },
    { key: "remarks", header: "Remarks" },
    { key: "requestedAt", header: "Requested", format: "date" },
    { key: "status", header: "Status" },
    { key: "decidedBy", header: "Decided by" },
    { key: "decidedAt", header: "Decided on", format: "date" },
    { key: "recoveryPerPeriod", header: "Recovery per payout", align: "right", format: "money" },
    { key: "recoveredAmount", header: "Recovered", align: "right", format: "money" },
    { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Advances",
    entity: "Advance",
    filters: describeAdvanceFilters(params, company?.name ?? null, describeScope(scope)),
    result: {
      columns,
      rows: rows.map((a) => ({
        id: a.id,
        riderCode: a.employee.employeeCode,
        rider: a.employee.name,
        companies: a.employee.companies.map((c) => c.company.name).join(", "),
        amount: Number(a.amount),
        priority: a.priority === "EMERGENCY" ? "Emergency" : "Low priority",
        reason: a.reason?.name ?? "",
        remarks: a.remarks ?? "",
        requestedAt: a.createdAt,
        status: a.status[0] + a.status.slice(1).toLowerCase(),
        decidedBy: a.decidedBy?.name ?? "",
        decidedAt: a.decidedAt,
        recoveryPerPeriod: a.recoveryPerPeriod === null ? 0 : Number(a.recoveryPerPeriod),
        recoveredAmount: Number(a.recoveredAmount),
        outstanding: a.status === "APPROVED" ? Math.max(0, Number(a.amount) - Number(a.recoveredAmount)) : 0,
      })),
      summary: [{ label: "Requests", value: note }],
      emptyMessage: "No advance requests match these filters.",
    },
  });
}
