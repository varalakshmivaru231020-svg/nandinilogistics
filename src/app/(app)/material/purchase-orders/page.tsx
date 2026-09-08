import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { formatDate, money } from "@/lib/utils";
import { PoFilters } from "./po-filters";

export const metadata = { title: "Purchase Orders" };

const PAGE_SIZE = 30;

const STATUS_TONE: Record<string, "slate" | "amber" | "green" | "sky" | "violet" | "red"> = {
  DRAFT: "slate", PENDING_APPROVAL: "amber", APPROVED: "green",
  PARTIALLY_RECEIVED: "sky", RECEIVED: "violet", CLOSED: "slate", CANCELLED: "red",
};

type PoRow = {
  id: string; poNo: string; status: string; poDate: Date; expectedDate: Date | null;
  totalAmount: unknown;
  project: { code: string }; vendor: { name: string };
  items: Array<{ orderedQty: unknown; receivedQty: unknown }>;
  _count: { items: number; grns: number };
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.purchaseOrder.view);
  const { q = "", status = "all", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const where = {
    ...projectScopeFilter(ctx),
    ...(q.trim() ? { poNo: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    ...(status !== "all" ? { status: status as never } : {}),
  };

  const [orders, total, pendingApproval] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { poDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        project: { select: { code: true } },
        vendor: { select: { name: true } },
        items: { select: { orderedQty: true, receivedQty: true } },
        _count: { select: { items: true, grns: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.count({
      where: { ...projectScopeFilter(ctx), status: "PENDING_APPROVAL" },
    }),
  ]);

  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  const columns: Column<PoRow>[] = [
    {
      key: "po",
      header: "Purchase order",
      render: (p) => (
        <div>
          <Link href={`/material/purchase-orders/${p.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-600">
            {p.poNo}
          </Link>
          <p className="text-xs text-slate-500">{p.project.code} · {p._count.items} line(s)</p>
        </div>
      ),
    },
    { key: "vendor", header: "Vendor", render: (p) => <span className="text-sm">{p.vendor.name}</span> },
    { key: "date", header: "Raised", render: (p) => <span className="text-xs text-slate-500">{formatDate(p.poDate)}</span> },
    {
      key: "expected",
      header: "Expected",
      render: (p) => {
        if (!p.expectedDate) return <span className="text-xs text-slate-400">—</span>;
        const overdue =
          new Date(p.expectedDate) < new Date() &&
          !["RECEIVED", "CLOSED", "CANCELLED"].includes(p.status);
        return (
          <span className={overdue ? "text-xs font-medium text-red-600" : "text-xs text-slate-500"}>
            {formatDate(p.expectedDate)}
            {overdue && " · overdue"}
          </span>
        );
      },
    },
    {
      key: "progress",
      header: "Received",
      align: "right",
      className: "num",
      render: (p) => {
        const ordered = p.items.reduce((s, i) => s + Number(i.orderedQty), 0);
        const received = p.items.reduce((s, i) => s + Number(i.receivedQty), 0);
        const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
        return (
          <span className={pct === 100 ? "text-xs text-emerald-700" : "text-xs text-slate-600"}>
            {pct}%
          </span>
        );
      },
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "num",
      visible: showRate,
      render: (p) => <span className="text-sm">{money(p.totalAmount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "slate"}>{p.status.replace(/_/g, " ")}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        description="Ordered vs received vs pending, with overdue deliveries surfaced rather than discovered."
        actions={
          <div className="flex items-center gap-2">
            {pendingApproval > 0 && <Badge tone="amber">{pendingApproval} awaiting approval</Badge>}
            {ctx.has(PERM.material.purchaseOrder.create) && (
              <Link href="/material/purchase-orders/new">
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  New purchase order
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <PoFilters q={q} status={status} />

        {orders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={q || status !== "all" ? "No purchase orders match" : "No purchase orders yet"}
              description="A PO is raised from an approved indent, carrying only the shortfall left after the stock check."
            />
          </Card>
        ) : (
          <>
            <DataTable columns={columns} rows={orders} rowKey={(p) => p.id} dense />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              buildHref={(n) => {
                const sp = new URLSearchParams();
                if (q) sp.set("q", q);
                if (status !== "all") sp.set("status", status);
                sp.set("page", String(n));
                return `?${sp.toString()}`;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
