import Link from "next/link";
import { FileText } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, pageHref, PO_STATUSES, poListWhere, readPoListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { poLookups } from "./lookups";
import { NewPoDrawer } from "./new-po-drawer";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { cn, formatDate, money } from "@/lib/utils";

export const metadata = { title: "Purchase Orders" };

const PAGE_SIZE = 30;

const STATUS_TONE: Record<string, "slate" | "warn" | "good" | "brand" | "navy" | "bad"> = {
  DRAFT: "slate", PENDING_APPROVAL: "warn",
  PENDING_PM_APPROVAL: "warn", PENDING_ADMIN_APPROVAL: "navy", APPROVED: "good",
  PARTIALLY_RECEIVED: "brand", RECEIVED: "navy", CLOSED: "slate", CANCELLED: "bad",
};

type PoRow = {
  id: string; poNo: string; status: string; poDate: Date; expectedDate: Date | null;
  totalAmount: unknown; revision: number; indentId: string | null;
  project: { code: string }; vendor: { name: string };
  createdBy: { name: string };
  pmApprovedBy: { name: string } | null;
  adminApprovedBy: { name: string } | null;
  items: Array<{ orderedQty: unknown; receivedQty: unknown }>;
  _count: { items: number; grns: number };
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.purchaseOrder.view);
  const canPrint = ctx.has(PERM.material.purchaseOrder.print);

  const lookups = ctx.has(PERM.material.purchaseOrder.create) ? await poLookups(ctx) : null;
  const raw = await searchParams;
  const params = readPoListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);

  // Shared with the export, so a download holds exactly what this screen shows.
  const where = poListWhere(ctx, params);
  const [orders, total, projects] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { poDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        project: { select: { code: true } },
        vendor: { select: { name: true } },
        createdBy: { select: { name: true } },
        pmApprovedBy: { select: { name: true } },
        adminApprovedBy: { select: { name: true } },
        items: { select: { orderedQty: true, receivedQty: true } },
        _count: { select: { items: true, grns: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
    projectOptions(ctx),
  ]);

  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  const columns: Column<PoRow>[] = [
    {
      key: "po",
      header: "Purchase order",
      render: (p) => (
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/material/purchase-orders/${p.id}`}
              className="text-[12.5px] font-bold text-navy-950 hover:text-brand-500"
            >
              {p.poNo}
            </Link>
            {p.revision > 0 && <Badge tone="warn">rev {p.revision}</Badge>}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-muted-400">
            {p.indentId ? "from an approved indent · " : ""}{formatDate(p.poDate)}
          </p>
          {/* Who raised it, and how far the two approvals have got. */}
          <p className="text-[11px] font-medium text-muted-400">
            {p.adminApprovedBy
              ? `approved ${p.adminApprovedBy.name}`
              : p.pmApprovedBy
                ? `PM ✓ ${p.pmApprovedBy.name}`
                : `raised ${p.createdBy.name}`}
          </p>
        </div>
      ),
    },
    { key: "vendor", header: "Vendor", render: (p) => <span className="text-[12.5px] font-semibold text-navy-900">{p.vendor.name}</span> },
    {
      key: "items",
      header: "Items",
      render: (p) => (
        <span className="text-[12px] font-medium text-muted-600">
          {p._count.items} line{p._count.items === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "num",
      visible: showRate,
      render: (p) => <span className="text-[12.5px] font-bold text-navy-950">{money(p.totalAmount)}</span>,
    },
    {
      key: "delivery",
      header: "Delivery",
      render: (p) => {
        if (!p.expectedDate) return <span className="text-[12px] text-muted-400">—</span>;
        const done = ["RECEIVED", "CLOSED"].includes(p.status);
        const late = new Date(p.expectedDate) < new Date() && !done && p.status !== "CANCELLED";
        const ordered = p.items.reduce((s, i) => s + Number(i.orderedQty), 0);
        const received = p.items.reduce((s, i) => s + Number(i.receivedQty), 0);
        const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
        return (
          <span
            className={cn(
              "text-[12px] font-semibold",
              late ? "text-bad-600" : done ? "text-good-700" : "text-navy-600",
            )}
          >
            {formatDate(p.expectedDate)}
            {late && " · overdue"}
            <span className="num block text-[11px] font-medium text-muted-400">{pct}% received</span>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "slate"}>{p.status.replace(/_/g, " ")}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <span className="inline-flex items-center gap-1.5">
          {canPrint && (
            <Link
              href={`/print/purchase-orders/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Print"
              className="rounded-[7px] border border-line-400 px-2 py-1 text-[11px] font-bold text-muted-600 transition-colors hover:bg-surface-hover hover:text-navy-900"
            >
              ⎙ Print
            </Link>
          )}
          <Link
            href={`/material/purchase-orders/${p.id}`}
            className="rounded-[7px] border border-line-400 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition-colors hover:bg-surface-hover"
          >
            View
          </Link>
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
        actions={
          <div className="flex items-center gap-2">
            {ctx.has(PERM.material.purchaseOrder.create) && (
              <NewPoDrawer
                projects={lookups!.projects}
                vendors={lookups!.vendors}
                terms={lookups!.terms}
                items={lookups!.items}
                openIndents={lookups!.openIndents}
              />
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <ListToolbar
          className="mb-0"
          searchPlaceholder="Search PO no., vendor, item, indent…"
          filters={[
            { name: "project", label: "Project", options: projects },
            { name: "status", label: "Status", options: enumOptions(PO_STATUSES) },
          ]}
          dateRange={{ label: "PO date" }}
          count={total}
          countNoun="purchase orders"
        />

        {orders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={filtered ? "No purchase orders match" : "No purchase orders yet"}
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
              buildHref={(n) => pageHref(query, n)}
            />
          </>
        )}
      </div>

      <ListNote>
        Every PO records who raised it and both approvals (Project Manager → Admin). Editing an approved PO creates a new revision and restarts approval.
      </ListNote>
    </div>
  );
}
