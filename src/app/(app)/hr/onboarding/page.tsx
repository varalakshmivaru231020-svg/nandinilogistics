import Link from "next/link";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope, onboardingWhere, readOnboardingParams } from "@/lib/hr/list-filters";
import { ONBOARDING_LABEL, ONBOARDING_STATUSES, ONBOARDING_TONE, type OnboardingStatus } from "@/lib/riders/onboarding";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isRiderType } from "@/lib/riders/onboarding";
import { loadReferrers } from "../workforce";
import { NewRiderButton } from "../new-rider-button";

export const metadata = { title: "Onboarding" };

interface Row {
  id: string;
  code: string;
  name: string;
  mobile: string;
  companies: string;
  type: string;
  status: OnboardingStatus;
  submittedAt: string;
  decidedAt: string;
  decidedBy: string;
  lead: string;
}

const BADGE: Record<string, "slate" | "warn" | "good" | "bad"> = {
  draft: "slate", warn: "warn", good: "good", bad: "bad",
};

/**
 * The onboarding queue — SOW §3.2. Opens on the forms waiting for review;
 * the tabs show every other state. A row opens the rider, where the decision
 * is taken.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company?: string; q?: string }>;
}) {
  const ctx = await requirePermission(PERM.hr.employee.view);
  const raw = await searchParams;
  const params = readOnboardingParams(raw);
  const scope = employeeScope(ctx);

  const [rows, counts, companies] = await Promise.all([
    prisma.employee.findMany({
      where: { AND: [scope, onboardingWhere(params)] },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, employeeCode: true, name: true, mobile: true, onboardingStatus: true,
        submittedAt: true, decidedAt: true,
        employmentType: { select: { name: true } },
        companies: { select: { company: { select: { name: true } } } },
        decidedBy: { select: { name: true } },
        lead: { select: { leadNo: true } },
      },
    }),
    prisma.employee.groupBy({
      by: ["onboardingStatus"],
      where: { AND: [scope, onboardingWhere({ ...params, status: "" })] },
      _count: { _all: true },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const held = new Map(counts.map((c) => [c.onboardingStatus as string, c._count._all]));
  const total = counts.reduce((s, c) => s + c._count._all, 0);

  const tabs: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "All", count: total },
    ...ONBOARDING_STATUSES.map((s) => ({ key: s, label: ONBOARDING_LABEL[s], count: held.get(s) ?? 0 })),
  ];
  const activeTab = params.status || "all";
  const query = (status: string) => {
    const sp = new URLSearchParams();
    sp.set("status", status);
    if (params.company) sp.set("company", params.company);
    if (params.q) sp.set("q", params.q);
    return `/hr/onboarding?${sp}`;
  };

  const data: Row[] = rows.map((r) => ({
    id: r.id,
    code: r.employeeCode,
    name: r.name,
    mobile: r.mobile,
    companies: r.companies.map((c) => c.company.name).join(", ") || "—",
    type: r.employmentType.name,
    status: r.onboardingStatus as OnboardingStatus,
    submittedAt: r.submittedAt ? formatDateTime(r.submittedAt) : "—",
    decidedAt: r.decidedAt ? formatDateTime(r.decidedAt) : "—",
    decidedBy: r.decidedBy?.name ?? "—",
    lead: r.lead?.leadNo ?? "—",
  }));

  const columns: Column<Row>[] = [
    {
      key: "name", header: "Rider",
      render: (r) => (
        <Link href={`/hr/${r.id}`} className="font-bold text-navy-950 hover:text-brand-700">
          {r.name}
          <span className="num ml-1.5 text-[11px] font-medium text-muted-400">{r.code}</span>
        </Link>
      ),
    },
    { key: "mobile", header: "Mobile", render: (r) => <span className="num">{r.mobile}</span> },
    { key: "companies", header: "Companies", render: (r) => r.companies },
    { key: "type", header: "Type", render: (r) => r.type },
    { key: "status", header: "Status", render: (r) => <Badge tone={BADGE[ONBOARDING_TONE[r.status]]}>{ONBOARDING_LABEL[r.status]}</Badge> },
    { key: "submittedAt", header: "Submitted", render: (r) => r.submittedAt },
    { key: "decidedAt", header: "Decided", render: (r) => (r.decidedAt === "—" ? "—" : `${r.decidedAt} · ${r.decidedBy}`) },
    { key: "lead", header: "From lead", render: (r) => <span className="num">{r.lead}</span> },
  ];

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) sp.set(k, String(v));

  // The "+ New rider" drawer's lists, only for whoever may create.
  const canCreate = ctx.has(PERM.hr.employee.create);
  const [formTypes, formDesignations, formCompanies, referrers] = canCreate
    ? await Promise.all([
        prisma.employmentType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
        prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        loadReferrers(),
      ])
    : [[], [], [], []];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Onboarding"
        description="Forms move Draft → Submitted → Accepted or Rejected. Accepting a rider activates them and sends the app link on WhatsApp."
        actions={
          <div className="flex items-center gap-2">
            {ctx.has(PERM.hr.employee.export) && (
              <ExportMenu href={(format) => exportHref("/api/hr/onboarding/export", format, sp)} />
            )}
            {canCreate && (
              <NewRiderButton
                employmentTypes={formTypes}
                riderTypeId={formTypes.find((t) => isRiderType(t.name))?.id ?? null}
                referrers={referrers}
                designations={formDesignations}
                companies={formCompanies}
                canManageCompanies={ctx.has(PERM.hr.employee.manageCompanies)}
              />
            )}
          </div>
        }
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={query(t.key)}
            className={cn(
              "rounded-full px-3 py-[6px] text-[12px] font-bold transition-colors",
              activeTab === t.key ? "bg-navy-950 text-white" : "bg-surface-field text-navy-600 hover:bg-surface-hover",
            )}
          >
            {t.label} <span className="num opacity-70">{t.count}</span>
          </Link>
        ))}
      </div>

      <ListToolbar
        searchPlaceholder="Search name, Rider ID or mobile…"
        filters={[{ name: "company", label: "Company", allLabel: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) }]}
        count={data.length}
        countNoun={data.length === 1 ? "form" : "forms"}
      />

      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        empty={<p className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">Nothing {activeTab === "all" ? "on record" : ONBOARDING_LABEL[activeTab as OnboardingStatus]?.toLowerCase() ?? ""} right now.</p>}
      />
      <ListNote>
        A Team Leader sees the riders of the companies assigned to them; a tele-caller the riders whose lead they own. Admin sees everyone, including riders who have left.
      </ListNote>
    </div>
  );
}
