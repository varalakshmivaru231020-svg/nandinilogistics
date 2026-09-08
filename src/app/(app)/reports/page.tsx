import Link from "next/link";
import { BarChart3, Download } from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { REPORTS } from "@/lib/reports";
import { Badge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireAuth();

  // Only the reports this role covers.
  const available = REPORTS.filter((r) => ctx.has(`reports.${r.key}.view`)).map((r) => ({
    ...r,
    canExport: ctx.has(`reports.${r.key}.export`),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reports"
        description="Not one dashboard for everyone — each report is built around what a particular role has to decide."
        actions={<Badge tone="slate">{available.length} available to you</Badge>}
      />

      {available.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" />}
            title="No reports available to you"
            description="Your role does not include any report permission yet."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((r) => (
            <Link key={r.key} href={`/reports/${r.key}`}>
              <Card className="h-full transition hover:border-brand-300 hover:shadow">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{r.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Built for the {r.audience} view</p>
                    </div>
                    {r.canExport && (
                      <Badge tone="green">
                        <Download className="mr-1 h-3 w-3" />
                        CSV
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.description}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
