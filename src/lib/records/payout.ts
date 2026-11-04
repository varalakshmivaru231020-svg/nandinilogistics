import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE } from "@/lib/payouts/list-display";
import { employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";
import { payoutDecisions } from "@/lib/screens/rows/payout";

import type { RecordView } from "./shared";

/**
 * One payout line: the rider, the period, the four figures and the final —
 * with the hold reason where there is one. Scoped exactly as the list is, so
 * a rider cannot open another rider's line by its id.
 */
export async function payoutLineRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const scope = await resolveViewerScope(prisma, ctx, PERM.payout.payout.viewAll);
  const seesDrafts = ctx.has(PERM.payout.import.view);
  const line = await prisma.payoutLine.findFirst({
    where: {
      id,
      employee: employeeScopeWhere(scope),
      ...(seesDrafts ? {} : { import: { status: "POSTED" } }),
    },
    include: {
      employee: { select: { name: true, employeeCode: true } },
      import: {
        select: {
          status: true, periodFrom: true, periodTo: true, fileName: true, postedAt: true,
          company: { select: { name: true, payoutColumnMap: true } },
          postedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!line) return null;

  const posted = line.import.status === "POSTED";

  /*
   * Everything else the company's sheet said about this rider — orders,
   * incentives, penalties, whatever columns the company uses — kept on the
   * line as `raw`. The figures already shown above are left out, so the
   * breakdown is what the totals are made of, in the sheet's own words.
   */
  const mapped = new Set(Object.values((line.import.company.payoutColumnMap ?? {}) as Record<string, string>).map((h) => h.trim().toLowerCase()));
  const raw = (line.raw ?? {}) as Record<string, unknown>;
  const sheetFields = Object.entries(raw)
    .filter(([k, v]) => !mapped.has(k.trim().toLowerCase()) && v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => ({ label: k, value: String(v) }));

  return {
    key: "payouts",
    id: line.id,
    title: line.employee?.name ?? line.riderCode,
    subtitle: `${line.riderCode} · ${line.import.company.name}`,
    pills: [
      { label: PAYOUT_STATUS_LABEL[line.status] ?? line.status, tone: PAYOUT_STATUS_TONE[line.status] ?? "draft" },
      ...(posted ? [] : [{ label: "Draft", tone: "draft" as const }]),
    ],
    sections: [
      {
        label: "The payout",
        fields: [
          { label: "Period from", value: line.import.periodFrom.toISOString(), format: "date" },
          { label: "Period to", value: line.import.periodTo.toISOString(), format: "date" },
          { label: "Total payout", value: Number(line.totalPayout), format: "money" },
          { label: "Advance", value: Number(line.advance), format: "money" },
          { label: "Bike rental", value: Number(line.bikeRental), format: "money" },
          { label: "TDS", value: Number(line.tds), format: "money" },
          { label: "Final payout", value: Number(line.finalPayout), format: "money" },
          { label: "Posted on", value: line.import.postedAt?.toISOString() ?? null, format: "date" },
          { label: "Posted by", value: line.import.postedBy?.name ?? null },
          ...(line.holdReason ? [{ label: "Hold reason", value: line.holdReason, wide: true }] : []),
        ],
      },
      ...(sheetFields.length
        ? [{ label: `From the ${line.import.company.name} sheet`, fields: sheetFields }]
        : []),
    ],
    collections: [],
    actions: posted ? payoutDecisions({ id: line.id, status: line.status }, { hold: ctx.has(PERM.payout.payout.hold) }) : [],
    serverTime: new Date().toISOString(),
  };
}
