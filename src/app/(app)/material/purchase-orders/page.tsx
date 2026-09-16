import Link from "next/link";
import { FileText } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, pageHref, PO_STATUSES, poListWhere, readPoListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { vendorOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { poLookups } from "./lookups";
import { NewPoDrawer } from "./new-po-drawer";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { cn, formatDate, moneyShort, qty } from "@/lib/utils";

export const metadata = { title: "Purchase Orders" };

const PAGE_SIZE = 30;

/** The design writes each state in words. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PENDING_PM_APPROVAL: "Pending PM approval",
  PENDING_ADMIN_APPROVAL: "Pending admin approval",
  APPROVED: "Approved · sent to vendor",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CLOSED: "Closed · matched",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, "slate" | "warn" | "good" | "brand" | "violet" | "bad"> = {
  DRAFT: "slate", PENDING_APPROVAL: "warn",
  PENDING_PM_APPROVAL: "warn", PENDING_ADMIN_APPROVAL: "violet", APPROVED: "brand",
  PARTIALLY_RECEIVED: "warn", RECEIVED: "good", CLOSED: "good", CANCELLED: "bad",
};

type PoRow = {
  id: string; poNo: string; status: string; poDate: Date; expectedDate: Date | null;
  totalAmount: unknown; revision: number; indentId: string | null;
  project: { code: string }; vendor: { name: string };
  createdBy: { name: string };
  pmApprovedBy: { name: string } | null;
  adminApprovedBy: { name: string } | null;
  items: Array<{ orderedQty: unknown; receivedQty: unknown; item: { name: string; uom: { code: string } } }>;
  _count: { items: number; grns: number };
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.purchaseOrder.view);
  // Read once, so every row ages against the same instant.
  const nowMs = new Date().getTime();
  const canPrint = ctx.has(PERM.material.purchaseOrder.print);

  const lookups = ctx.has(PERM.material.purchaseOrder.create) ? await poLookups(ctx) : null;
  const raw = await searchParams;
  const params = readPoListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);

  // Shared with the export, so a download holds exactly what this screen shows.
  const where = poListWhere(ctx, params);
  const [orders, total, vendors] = await Promise.all([
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
        items: { select: { orderedQty: true, receivedQty: true, item: { select: { name: true, uom: { select: { code: true } } } } } },
        _count: { select: { items: true, grns: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
    vendorOptions(),
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
      render: (p) => {
        const first = p.items[0];
        const more = p._count.items - 1;
        return (
          <span className="text-[12.5px] font-medium text-navy-500">
            {first
              ? `${first.item.name} · ${qty(first.orderedQty, 3)} ${first.item.uom.code}`
              : "—"}
            {more > 0 && <span className="text-muted-400"> +{more}</span>}
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
      render: (p) => <span className="text-[12.5px] font-bold text-navy-950">{moneyShort(p.totalAmount)}</span>,
    },
    {
      key: "delivery",
      header: "Delivery",
      render: (p) => {
        if (!p.expectedDate) return <span className="text-[12px] text-muted-400">—</span>;
        const done = ["RECEIVED", "CLOSED"].includes(p.status);
        const late = new Date(p.expectedDate).getTime() < nowMs && !done && p.status !== "CANCELLED";
        const day = new Date(p.expectedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        const lateDays = Math.floor((nowMs - new Date(p.expectedDate).getTime()) / 86_400_000);
        return (
          <span
            className={cn(
              "text-[12px] font-semibold",
              late ? "text-bad-600" : done ? "text-good-700" : "text-navy-600",
            )}
          >
            {done ? `Received ${day}` : late ? `Late by ${lateDays} day${lateDays === 1 ? "" : "s"}` : `Due ${day}`}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "slate"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>,
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
            className="rounded-[7px] bg-brand-500 px-[11px] py-1.5 text-[10.5px] font-bold text-white transition-colors hover:bg-brand-600"
          >
            View
          </Link>
        </span>
      ),
    },
  ];

  return (
    <div>
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
            { name: "vendor", label: "Vendor", options: vendors },
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
