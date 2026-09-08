import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { daysBetween, formatDate, money } from "@/lib/utils";
import { IndentFilters } from "./indent-filters";

export const metadata = { title: "Indents" };

const PAGE_SIZE = 30;

const STATUS_TONE: Record<string, "slate" | "warn" | "brand" | "good" | "bad" | "navy"> = {
  DRAFT: "slate", SUBMITTED: "warn", PM_APPROVED: "brand", ADMIN_APPROVED: "good",
  PARTIALLY_ORDERED: "navy", ORDERED: "navy", CLOSED: "slate",
  REJECTED: "bad", CANCELLED: "slate",
};

type IndentRow = {
  id: string;
  indentNo: string;
  status: string;
  raisedAt: Date;
  requiredByDate: Date;
  estimatedValue: unknown;
  purpose: string | null;
  project: { code: string; name: string };
  raisedBy: { name: string };
  _count: { items: number };
};

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.indent.view);
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
        _count: { select: { items: true } },
      },
    }),
    prisma.indent.count({ where }),
    prisma.indent.count({
      where: { ...projectScopeFilter(ctx), status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    }),
  ]);

  const showAgeing = ctx.has(PERM.material.indent.viewAgeing);

  const columns: Column<IndentRow>[] = [
    {
      key: "no",
      header: "Indent",
      render: (i) => (
        <div>
          <Link href={`/material/indents/${i.id}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
            {i.indentNo}
          </Link>
          <p className="text-xs text-muted-500">{i.project.code} · {i._count.items} line(s)</p>
        </div>
      ),
    },
    { key: "raisedBy", header: "Raised by", render: (i) => <span className="text-sm">{i.raisedBy.name}</span> },
    {
      key: "purpose",
      header: "For",
      render: (i) => <span className="text-xs text-muted-600">{i.purpose ?? "—"}</span>,
    },
    { key: "raised", header: "Raised", render: (i) => <span className="text-xs text-muted-500">{formatDate(i.raisedAt)}</span> },
    {
      key: "required",
      header: "Required by",
      render: (i) => {
        const overdue = new Date(i.requiredByDate) < new Date();
        return (
          <span className={overdue ? "text-xs font-medium text-bad-600" : "text-xs text-muted-500"}>
            {formatDate(i.requiredByDate)}
          </span>
        );
      },
    },
    {
      key: "ageing",
      header: "Waiting",
      align: "right",
      visible: showAgeing,
      render: (i) => {
        if (!["SUBMITTED", "PM_APPROVED"].includes(i.status)) return <span className="text-muted-400">—</span>;
        const days = daysBetween(i.raisedAt);
        return (
          <span className={`num text-xs font-medium ${days > 3 ? "text-bad-600" : days > 1 ? "text-warn-700" : "text-muted-500"}`}>
            {days}d
          </span>
        );
      },
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "num",
      render: (i) => <span className="text-sm">{money(i.estimatedValue)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (i) => <Badge tone={STATUS_TONE[i.status] ?? "slate"}>{i.status.replace(/_/g, " ")}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Indents"
        description="Nothing is purchased without an approved indent. The approval trail builds itself as it moves."
        actions={
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <Badge tone="warn">{pendingCount} awaiting approval</Badge>}
            {ctx.has(PERM.material.indent.create) && (
              <Link href="/material/indents/new">
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Raise indent
                </Button>
              </Link>
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
            <DataTable columns={columns} rows={indents} rowKey={(i) => i.id} dense />
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
