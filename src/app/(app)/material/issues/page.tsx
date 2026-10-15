import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { issueListWhere, readIssueListParams, toSearchParams } from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { issueEmpty } from "@/lib/screens/rows/issue";
import { IssuesScreen } from "./issues-screen";

export const metadata = { title: "Material Issues" };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.issue.view);
  const raw = await searchParams;
  const params = readIssueListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.project || params.ack || params.status || params.from || params.to);

  const canCreate = ctx.has(PERM.material.issue.create);

  const [issues, projects] = await Promise.all([
    prisma.materialIssue.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: issueListWhere(ctx, params),
      orderBy: { issueDate: "desc" },
      take: 100,
      include: {
        store: { select: { name: true } },
        project: { select: { code: true } },
        workPackage: { select: { code: true, name: true } },
        issuedBy: { select: { name: true } },
        items: { include: { item: { select: { name: true, uom: { select: { name: true } } } } } },
        _count: { select: { returns: { where: { status: "PENDING" } } } },
      },
    }),
    projectOptions(ctx),
  ]);

  // Who each slip went to — and who cancelled it — are plain fields, so resolve the names.
  const userIds = [
    ...new Set(issues.flatMap((i) => [i.issuedToId, ...(i.cancelledById ? [i.cancelledById] : [])])),
  ];
  const people = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(people.map((r) => [r.id, r.name]));

  const pendingAck = issues.filter((i) => !i.acknowledgedAt && !i.cancelledAt).length;

  return (
    <div>
      <PageHeader
        title="Material Issues"
        description="Store to supervisor, valued at the weighted-average rate and acknowledged by whoever receives it."
        actions={
          canCreate ? (
            <Link
              href="/material/indents"
              className="rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              Issue against an indent
            </Link>
          ) : null
        }
      />

      <ListToolbar
        searchPlaceholder="Search issue, item, store, purpose…"
        filters={[
          { name: "project", label: "Projects", options: projects },
          {
            name: "status",
            label: "Status",
            allLabel: "Active and cancelled",
            options: [
              { value: "active", label: "Active" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
          {
            name: "ack",
            label: "Acknowledgement",
            allLabel: "Any acknowledgement",
            options: [
              { value: "pending", label: "Awaiting acknowledgement" },
              { value: "acknowledged", label: "Acknowledged" },
            ],
          },
        ]}
        dateRange={{ label: "Issued" }}
        count={issues.length}
      >
        {ctx.has(PERM.material.issue.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/issues/export", format, query)}
            disabled={issues.length === 0}
          />
        )}
      </ListToolbar>

      {issues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight className="h-8 w-8" />}
            title={issueEmpty(filtered).title}
            description={issueEmpty(filtered).description}
          />
        </Card>
      ) : (
        <IssuesScreen
          pendingAck={pendingAck}
          currentUserId={ctx.id}
          canAcknowledge={ctx.has(PERM.material.issue.acknowledge)}
          canCancel={ctx.has(PERM.material.issue.cancel)}
          canRaiseReturn={ctx.has(PERM.material.return.create)}
          canPrint={ctx.has(PERM.material.issue.print)}
          canViewValue={ctx.has(PERM.material.stock.viewValuation)}
          issues={issues.map((i) => ({
            id: i.id,
            issueNo: i.issueNo,
            issueDate: i.issueDate.toISOString(),
            projectCode: i.project.code,
            storeName: i.store.name,
            workPackage: i.workPackage ? `${i.workPackage.code} — ${i.workPackage.name}` : null,
            issuedByName: i.issuedBy.name,
            issuedToId: i.issuedToId,
            issuedToName: nameById.get(i.issuedToId) ?? "—",
            purpose: i.purpose,
            totalValue: Number(i.totalValue),
            acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
            cancelledAt: i.cancelledAt ? i.cancelledAt.toISOString() : null,
            cancelledByName: i.cancelledById ? (nameById.get(i.cancelledById) ?? null) : null,
            cancelReason: i.cancelReason,
            pendingReturns: i._count.returns,
            lines: i.items.map((l) => ({
              id: l.id,
              name: l.item.name,
              uom: l.item.uom.name,
              issuedQty: Number(l.issuedQty),
              returnedQty: Number(l.returnedQty),
              rate: Number(l.rate),
              value: Number(l.value),
            })),
          }))}
        />
      )}
    </div>
  );
}
