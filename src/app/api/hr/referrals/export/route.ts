import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import type { ScreenShell } from "@/lib/screens/rows";
import { referralScreenRow } from "@/lib/screens/rows/hr";
import { describeReferralFilters, employeeScope, readReferralParams, referralWhere } from "@/lib/hr/list-filters";
import { referralStatus } from "@/lib/riders/referrals";
import { PERM } from "@/lib/permissions/codes";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Exports the referral history — every rider somebody referred, with the
 * referral's 25-day status computed the same way the screen computes it.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.hr.referral.view, PERM.hr.referral.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readReferralParams(params);
  const nowMs = Date.now();

  const riders = await prisma.employee.findMany({
    where: { AND: [employeeScope(ctx), referralWhere(listParams)] },
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    select: {
      id: true, name: true, employeeCode: true, createdAt: true, joinedOn: true,
      onboardingStatus: true, status: true, leftOn: true,
      referredBy: { select: { name: true, employeeCode: true } },
    },
  });
  const judged = riders.map((r) => ({ ...r, referral: referralStatus(r, nowMs) }));
  const matching = listParams.status ? judged.filter((r) => r.referral.state === listParams.status) : judged;
  const { rows, note } = capRows(matching);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((r) =>
        referralScreenRow({
          id: r.id,
          referrer: r.referredBy?.name ?? "—",
          referrerCode: r.referredBy?.employeeCode ?? "",
          referred: r.name,
          referredCode: r.employeeCode,
          referredOn: formatDate(r.createdAt),
          joinedOn: r.joinedOn ? formatDate(r.joinedOn) : null,
          status: r.referral,
        }),
      ),
      empty: { title: "No referrals yet." },
    };
  }

  return exportResponse({
    ...gate,
    screen,
    title: "Referrals",
    entity: "Employee",
    filters: describeReferralFilters(listParams),
    result: {
      columns: [
        { key: "referrer", header: "Referred by" },
        { key: "referrerCode", header: "Referrer ID" },
        { key: "referred", header: "Referred rider" },
        { key: "referredCode", header: "Rider ID" },
        { key: "referredOn", header: "Referred on", format: "date" },
        { key: "joinedOn", header: "Joined", format: "date" },
        { key: "validUntil", header: "Valid until", format: "date" },
        { key: "status", header: "Referral status" },
        { key: "eligible", header: "Eligible" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        referrer: r.referredBy?.name ?? "",
        referrerCode: r.referredBy?.employeeCode ?? "",
        referred: r.name,
        referredCode: r.employeeCode,
        referredOn: r.createdAt,
        joinedOn: r.joinedOn,
        validUntil: r.referral.validUntil,
        status: r.referral.label,
        eligible: r.referral.eligible ? "Yes" : "No",
      })),
      summary: [
        { label: "Referrals", value: note },
        { label: "Eligible", value: String(matching.filter((r) => r.referral.eligible).length) },
      ],
      emptyMessage: "No referrals match these filters.",
    },
  });
}
