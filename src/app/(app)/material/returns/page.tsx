import Link from "next/link";
import { Plus, Undo2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, readReturnListParams, RETURN_STATUSES, returnListWhere, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { Badge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, money } from "@/lib/utils";

export const metadata = { title: "Material Returns" };

const RETURN_STATUS_TONE: Record<string, "warn" | "good" | "bad"> = {
  PENDING: "warn", APPROVED: "good", REJECTED: "bad",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.return.view);
  const raw = await searchParams;
  const params = readReturnListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);
  const canViewValue = ctx.has(PERM.material.stock.viewValuation);

  const [returns, projects] = await Promise.all([
    prisma.materialReturn.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: returnListWhere(ctx, params),
      orderBy: { returnDate: "desc" },
      take: 100,
      include: {
        project: { select: { code: true } },
        store: { select: { name: true } },
        issue: { select: { issueNo: true } },
        raisedBy: { select: { name: true } },
        items: { select: { condition: true } },
      },
    }),
    projectOptions(ctx),
  ]);

  const pending = returns.filter((r) => r.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Material Returns"
        description="Unused material coming back from site to the store it was issued from. Stock returns only when the store approves — damaged material included, with its condition noted."
        actions={
          ctx.has(PERM.material.return.create) ? (
            <Link
              href="/material/returns/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New return
            </Link>
          ) : null
        }
      />

      <ListToolbar
        searchPlaceholder="Search return, issue, item, raised by…"
        filters={[
          { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(RETURN_STATUSES) },
          { name: "project", label: "Projects", options: projects },
        ]}
        dateRange={{ label: "Returned" }}
        count={returns.length}
      >
        {ctx.has(PERM.material.return.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/returns/export", format, query)}
            disabled={returns.length === 0}
          />
        )}
      </ListToolbar>

      {returns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Undo2 className="h-8 w-8" />}
            title={filtered ? "No returns match these filters" : "No material returns yet"}
            description="When a site has material left over, raise a return against the issue slip it came on. The store approves it back into stock."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {ctx.has(PERM.material.return.approve) && pending > 0 && (
            <p className="text-xs text-warn-700">{pending} return(s) on this list are waiting for your decision.</p>
          )}
          {returns.map((r) => {
            const damaged = r.items.filter((i) => i.condition === "Damaged").length;
            return (
              <Card key={r.id}>
                <CardBody className="p-0">
                  <Link
                    href={`/material/returns/${r.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-navy-950">{r.returnNo}</span>
                        <Badge tone="slate">{r.project.code}</Badge>
                        <Badge tone={RETURN_STATUS_TONE[r.status] ?? "warn"}>{r.status}</Badge>
                        {damaged > 0 && <Badge tone="muted">{damaged} damaged line(s)</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-500">
                        Against {r.issue.issueNo} · into {r.store.name} · {formatDate(r.returnDate)}
                        {r.reason && ` · ${r.reason}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-medium text-navy-900">
                        {canViewValue ? money(Number(r.totalValue)) : `${r.items.length} line(s)`}
                      </p>
                      <p className="text-xs text-muted-400">raised by {r.raisedBy.name}</p>
                    </div>
                  </Link>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
