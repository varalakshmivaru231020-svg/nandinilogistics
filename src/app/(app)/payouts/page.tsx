import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { payoutLineWhere, readPayoutListParams } from "@/lib/payouts/list-filters";
import { payoutSummaryOf } from "@/lib/payouts/list-display";
import { describeScope, resolveViewerScope } from "@/lib/payouts/scope";
import { PayoutsScreen } from "./payouts-screen";

export const metadata = { title: "Payouts" };

/**
 * Posted payouts, one line per rider per period — SOW §3.4 and §3.5.
 *
 * Whose lines a person sees is `resolveViewerScope`: Admin all, a Team Leader
 * the team's, a tele-caller the riders they onboarded, a rider their own.
 * Drafts are only in view for whoever may manage imports.
 */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.payout.payout.view);
  const params = readPayoutListParams(await searchParams);
  const scope = await resolveViewerScope(prisma, ctx, PERM.payout.payout.viewAll);
  const seesDrafts = ctx.has(PERM.payout.import.view);

  const [lines, companies] = await Promise.all([
    prisma.payoutLine.findMany({
      where: payoutLineWhere(scope, params, { seesDrafts }),
      orderBy: [{ import: { periodFrom: "desc" } }, { riderCode: "asc" }],
      select: {
        id: true, riderCode: true, totalPayout: true, advance: true, bikeRental: true, tds: true,
        finalPayout: true, status: true, holdReason: true, employeeId: true,
        employee: { select: { name: true } },
        import: { select: { id: true, status: true, periodFrom: true, periodTo: true, company: { select: { name: true } } } },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <PayoutsScreen
      lines={lines.map((l) => ({
        id: l.id,
        riderCode: l.riderCode,
        riderName: l.employee?.name ?? null,
        company: l.import.company.name,
        importId: l.import.id,
        importStatus: l.import.status,
        periodFrom: l.import.periodFrom.toISOString(),
        periodTo: l.import.periodTo.toISOString(),
        totalPayout: Number(l.totalPayout),
        advance: Number(l.advance),
        bikeRental: Number(l.bikeRental),
        tds: Number(l.tds),
        finalPayout: Number(l.finalPayout),
        status: l.status,
        holdReason: l.holdReason,
      }))}
      summary={payoutSummaryOf(lines)}
      companies={companies}
      picked={{ company: params.company, status: params.status, from: params.from, to: params.to }}
      q={params.q}
      scopeWords={describeScope(scope)}
      can={{
        hold: ctx.has(PERM.payout.payout.hold),
        export: ctx.has(PERM.payout.payout.export),
        imports: ctx.has(PERM.payout.import.view),
      }}
    />
  );
}
