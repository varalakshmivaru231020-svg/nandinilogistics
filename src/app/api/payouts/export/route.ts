import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { PAYOUT_EMPTY_FILTERED, PAYOUT_EMPTY_NONE, payoutDecisions, payoutScreenRow } from "@/lib/screens/rows/payout";
import { payoutBandFigures, payoutSummaryOf } from "@/lib/payouts/list-display";
import { describePayoutFilters, payoutLineWhere, readPayoutListParams } from "@/lib/payouts/list-filters";
import { describeScope, resolveViewerScope } from "@/lib/payouts/scope";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every payout line the screen shows, narrowed the same way: the viewer's
 * scope, the filters, and drafts only for whoever manages imports.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.payout.payout.view, PERM.payout.payout.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readPayoutListParams(gate.params);
  const scope = await resolveViewerScope(prisma, ctx, PERM.payout.payout.viewAll);
  const seesDrafts = ctx.has(PERM.payout.import.view);

  const [lines, company] = await Promise.all([
    prisma.payoutLine.findMany({
      where: payoutLineWhere(scope, params, { seesDrafts }),
      orderBy: [{ import: { periodFrom: "desc" } }, { riderCode: "asc" }],
      select: {
        id: true, riderCode: true, totalPayout: true, advance: true, bikeRental: true, tds: true,
        finalPayout: true, status: true, holdReason: true, employeeId: true,
        employee: { select: { name: true } },
        import: { select: { status: true, periodFrom: true, periodTo: true, company: { select: { name: true } } } },
      },
    }),
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(lines);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const canHold = ctx.has(PERM.payout.payout.hold);
    screen = {
      rows: rows.slice(from, to).map((l) =>
        payoutScreenRow(
          {
            id: l.id,
            riderCode: l.riderCode,
            riderName: l.employee?.name ?? null,
            company: l.import.company.name,
            periodFrom: l.import.periodFrom,
            periodTo: l.import.periodTo,
            totalPayout: Number(l.totalPayout),
            advance: Number(l.advance),
            bikeRental: Number(l.bikeRental),
            tds: Number(l.tds),
            finalPayout: Number(l.finalPayout),
            status: l.status,
            holdReason: l.holdReason,
          },
          l.import.status === "POSTED" ? payoutDecisions({ id: l.id, status: l.status }, { hold: canHold }) : [],
        ),
      ),
      band: bandOf(payoutBandFigures(payoutSummaryOf(lines))),
      empty: rows.length === 0 ? PAYOUT_EMPTY_NONE : PAYOUT_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "riderCode", header: "Rider ID" },
    { key: "rider", header: "Rider" },
    { key: "company", header: "Company" },
    { key: "periodFrom", header: "Period from", format: "date" },
    { key: "periodTo", header: "Period to", format: "date" },
    { key: "totalPayout", header: "Total payout", align: "right", format: "money" },
    { key: "advance", header: "Advance", align: "right", format: "money" },
    { key: "bikeRental", header: "Bike rental", align: "right", format: "money" },
    { key: "tds", header: "TDS", align: "right", format: "money" },
    { key: "finalPayout", header: "Final payout", align: "right", format: "money" },
    { key: "status", header: "Status" },
    { key: "holdReason", header: "Hold reason" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Payouts",
    entity: "PayoutLine",
    filters: describePayoutFilters(params, company?.name ?? null, describeScope(scope)),
    result: {
      columns,
      rows: rows.map((l) => ({
        id: l.id,
        riderCode: l.riderCode,
        rider: l.employee?.name ?? "",
        company: l.import.company.name,
        periodFrom: l.import.periodFrom,
        periodTo: l.import.periodTo,
        totalPayout: Number(l.totalPayout),
        advance: Number(l.advance),
        bikeRental: Number(l.bikeRental),
        tds: Number(l.tds),
        finalPayout: Number(l.finalPayout),
        status: l.status === "HOLD" ? "On hold" : l.import.status === "DRAFT" ? "Draft" : "Paid",
        holdReason: l.holdReason ?? "",
      })),
      summary: [{ label: "Lines", value: note }],
      emptyMessage: "No payout lines match these filters.",
    },
  });
}
