import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { getReport, runReport } from "@/lib/reports";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { ReportView } from "./report-view";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: getReport(key)?.label ?? "Report" };
}

export default async function ReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();

  const ctx = await requirePermission(`reports.${def.key}.view`);
  const result = await runReport(def.key, ctx);

  // Dates and Decimals do not cross the server/client boundary intact.
  const rows = JSON.parse(JSON.stringify(result.rows)) as Array<Record<string, unknown>>;

  return (
    <div className="mx-auto max-w-7xl">
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
        title={def.label}
        columns={result.columns}
        rows={rows}
        summary={result.summary}
        emptyMessage={result.emptyMessage}
        canExport={ctx.has(`reports.${def.key}.export`)}
      />
    </div>
  );
}
