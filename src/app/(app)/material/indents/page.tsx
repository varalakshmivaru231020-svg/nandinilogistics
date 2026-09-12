import { ClipboardList } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { indentLookups } from "./lookups";
import { NewIndentDrawer } from "./new-indent-drawer";
import { IndentCard } from "./indent-card";
import { Pagination } from "@/components/ui/data-table";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { IndentFilters } from "./indent-filters";

export const metadata = { title: "Requirement Indents" };

const PAGE_SIZE = 30;

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.indent.view);

  // Only loaded for someone who can actually raise one — the drawer needs the
  // same options the full /new page offers.
  const lookups = ctx.has(PERM.material.indent.create) ? await indentLookups(ctx) : null;
  const { q = "", status = "all", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  // Without viewAll a user sees only the indents they raised.
  const ownership = ctx.has(PERM.material.indent.viewAll) ? {} : { raisedById: ctx.id };

  const where = {
    ...projectScopeFilter(ctx),
    ...ownership,
    ...(q.trim() ? { indentNo: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    ...(status !== "all" ? { status: status as never } : {}),
  };

  const [indents, total, pendingCount] = await Promise.all([
    prisma.indent.findMany({
      where,
      orderBy: { raisedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        project: { select: { code: true, name: true } },
        raisedBy: { select: { name: true } },
        workPackage: { select: { name: true } },
        items: {
          select: {
            requestedQty: true, approvedQty: true,
            issueFromStockQty: true, toPurchaseQty: true,
          },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.indent.count({ where }),
    prisma.indent.count({
      where: { ...projectScopeFilter(ctx), status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    }),
  ]);

  const showAgeing = ctx.has(PERM.material.indent.viewAgeing);
  // Read once, after fetching, so every row ages against the same instant.
  const asOfMs = new Date().getTime();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Requirement Indents"
        description="Nothing is purchased without an approved indent. The approval trail builds itself as it moves."
        actions={
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <Badge tone="warn">{pendingCount} awaiting approval</Badge>}
            {ctx.has(PERM.material.indent.create) && lookups && (
              <NewIndentDrawer
                projects={lookups.projects}
                items={lookups.items}
                canSubmit={ctx.has(PERM.material.indent.submit)}
              />
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <IndentFilters q={q} status={status} />

        {indents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title={q || status !== "all" ? "No indents match these filters" : "No indents yet"}
              description={
                ctx.has(PERM.material.indent.create)
                  ? "Raise one from site with the item, quantity and the activity it is for."
                  : "Indents raised on your projects will appear here."
              }
            />
          </Card>
        ) : (
          <>
            <div className="space-y-2.5">
              {indents.map((i) => (
                <IndentCard
                  key={i.id}
                  indent={{
                    id: i.id,
                    indentNo: i.indentNo,
                    title: i.purpose || `${i._count.items} line${i._count.items === 1 ? "" : "s"}`,
                    project: i.project.code,
                    raisedBy: i.raisedBy.name,
                    raisedAt: i.raisedAt.toISOString(),
                    requiredBy: i.requiredByDate?.toISOString() ?? null,
                    activity: i.workPackage?.name ?? null,
                    status: i.status,
                    waitingDays:
                      showAgeing && ["SUBMITTED", "PM_APPROVED"].includes(i.status)
                        ? Math.floor((asOfMs - i.raisedAt.getTime()) / 86_400_000)
                        : null,
                    lines: i.items.map((l) => ({
                      requestedQty: Number(l.requestedQty),
                      approvedQty: l.approvedQty === null ? null : Number(l.approvedQty),
                      issueFromStockQty: Number(l.issueFromStockQty),
                      toPurchaseQty: Number(l.toPurchaseQty),
                    })),
                  }}
                />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              buildHref={(p) => {
                const sp = new URLSearchParams();
                if (q) sp.set("q", q);
                if (status !== "all") sp.set("status", status);
                sp.set("page", String(p));
                return `?${sp.toString()}`;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
