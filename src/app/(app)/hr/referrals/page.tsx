import Link from "next/link";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope, readReferralParams, referralWhere } from "@/lib/hr/list-filters";
import { referralStatus, REFERRAL_VALID_DAYS } from "@/lib/riders/referrals";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { ModuleStats } from "@/components/list/module-stats";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Referrals" };

interface Row {
  id: string;
  referrerId: string;
  referrer: string;
  referrerCode: string;
  referred: string;
  referredCode: string;
  referredOn: string;
  joinedOn: string;
  state: string;
  status: string;
  validUntil: string;
  eligible: boolean;
}

const TONE: Record<string, "slate" | "warn" | "good" | "bad"> = {
  PENDING: "warn", VALID: "good", EXPIRED: "slate", LEFT: "bad",
};

/**
 * Referral history — SOW §3.5: who referred whom, when the referred rider
 * joined, and whether the 25-day window is still open.
 */
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await requirePermission(PERM.hr.referral.view);
  const raw = await searchParams;
  const params = readReferralParams(raw);
  const nowMs = new Date().getTime();

  const rows = await prisma.employee.findMany({
    where: { AND: [employeeScope(ctx), referralWhere(params)] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, employeeCode: true, createdAt: true, joinedOn: true,
      onboardingStatus: true, status: true, leftOn: true,
      referredBy: { select: { id: true, name: true, employeeCode: true } },
    },
  });

  const all: Row[] = rows.map((r) => {
    const s = referralStatus(r, nowMs);
    return {
      id: r.id,
      referrerId: r.referredBy!.id,
      referrer: r.referredBy!.name,
      referrerCode: r.referredBy!.employeeCode,
      referred: r.name,
      referredCode: r.employeeCode,
      referredOn: formatDate(r.createdAt),
      joinedOn: r.joinedOn ? formatDate(r.joinedOn) : "—",
      state: s.state,
      status: s.label,
      validUntil: s.validUntil ? formatDate(s.validUntil) : "—",
      eligible: s.eligible,
    };
  });
  // The status is derived, so the filter is applied after the rows are read.
  const data = params.status ? all.filter((r) => r.state === params.status) : all;

  const columns: Column<Row>[] = [
    {
      key: "referrer", header: "Referred by",
      render: (r) => (
        <Link href={`/hr/${r.referrerId}`} className="font-bold text-navy-950 hover:text-brand-700">
          {r.referrer} <span className="num text-[11px] font-medium text-muted-400">{r.referrerCode}</span>
        </Link>
      ),
    },
    {
      key: "referred", header: "Referred rider",
      render: (r) => (
        <Link href={`/hr/${r.id}`} className="font-semibold text-navy-900 hover:text-brand-700">
          {r.referred} <span className="num text-[11px] font-medium text-muted-400">{r.referredCode}</span>
        </Link>
      ),
    },
    { key: "referredOn", header: "Referred on", render: (r) => r.referredOn },
    { key: "joinedOn", header: "Joined", render: (r) => r.joinedOn },
    { key: "validUntil", header: `Valid until (${REFERRAL_VALID_DAYS} days)`, render: (r) => r.validUntil },
    { key: "status", header: "Referral status", render: (r) => <Badge tone={TONE[r.state]}>{r.status}</Badge> },
    { key: "eligible", header: "Eligible", align: "center", render: (r) => (r.eligible ? "Yes" : "No") },
  ];

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) sp.set(k, String(v));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Referrals"
        description={`A referral is valid from the referred rider's joining date for ${REFERRAL_VALID_DAYS} days; the referrer is eligible once the rider has joined and stayed.`}
        actions={
          ctx.has(PERM.hr.referral.export) ? (
            <ExportMenu href={(format) => exportHref("/api/hr/referrals/export", format, sp)} />
          ) : undefined
        }
      />

      <ModuleStats
        figures={[
          { value: String(all.length), label: "Referrals" },
          { value: String(all.filter((r) => r.state === "VALID").length), label: "In the 25-day window", tone: "good" },
          { value: String(all.filter((r) => r.state === "PENDING").length), label: "Not yet joined", tone: "warn" },
          { value: String(all.filter((r) => r.eligible).length), label: "Eligible referrers" },
        ]}
      />

      <ListToolbar
        searchPlaceholder="Search referrer or rider…"
        filters={[{
          name: "status", label: "Status", allLabel: "Any status",
          options: [
            { value: "PENDING", label: "Not yet joined" },
            { value: "VALID", label: "Valid" },
            { value: "EXPIRED", label: "Completed 25 days" },
            { value: "LEFT", label: "Left early" },
          ],
        }]}
        count={data.length}
        countNoun={data.length === 1 ? "referral" : "referrals"}
      />

      <DataTable columns={columns} rows={data} rowKey={(r) => r.id} />
      <ListNote>A rider&apos;s own Referral ID is on their record; the app shares it with a button.</ListNote>
    </div>
  );
}
