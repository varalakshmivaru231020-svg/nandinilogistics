import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { getReport, runReport } from "@/lib/reports";
import { filterSpecFor, hasFilters, parseReportFilters } from "@/lib/reports/filters";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { ReportView } from "./report-view";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: getReport(key)?.label ?? "Report" };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();

  const ctx = await requirePermission(`reports.${def.key}.view`);

  const spec = filterSpecFor(def.key);
  const filters = parseReportFilters(await searchParams, spec);

  const [result, companies] = await Promise.all([
    runReport(def.key, ctx, filters),
    spec.company
      ? prisma.company.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Dates and Decimals do not cross the server/client boundary intact.
  const rows = JSON.parse(JSON.stringify(result.rows)) as Array<Record<string, unknown>>;

  return (
    <div>
      <PageHeader
        title={def.label}
        description={def.description}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/reports" className="hover:text-brand-600">Reports</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{def.label}</span>
          </span>
        }
        actions={<Badge tone="slate">For the {def.audience} view</Badge>}
      />

      <ReportView
        reportKey={def.key}
        columns={result.columns}
        rows={rows}
        summary={result.summary}
        emptyMessage={hasFilters(filters) ? "Nothing matches these filters." : result.emptyMessage}
        canExport={ctx.has(`reports.${def.key}.export`)}
        spec={spec}
        filters={filters}
        companies={companies.map((c) => ({ id: c.id, label: c.name }))}
      />
    </div>
  );
}
