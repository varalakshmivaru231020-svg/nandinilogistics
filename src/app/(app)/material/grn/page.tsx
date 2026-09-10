import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { grnLookups } from "./lookups";
import { NewGrnDrawer } from "./new-grn-drawer";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, qty } from "@/lib/utils";

export const metadata = { title: "Goods Receipt" };

const STATUS_TONE: Record<string, "slate" | "warn" | "good" | "bad"> = {
  DRAFT: "slate", INSPECTED: "warn", POSTED: "good", CANCELLED: "bad",
};

type GrnRow = {
  id: string; grnNo: string; status: string; grnDate: Date; challanNo: string | null;
  store: { name: string }; vendor: { name: string }; purchaseOrder: { poNo: string; id: string };
  items: Array<{ receivedQty: unknown; acceptedQty: unknown; rejectedQty: unknown }>;
};

export default async function GrnListPage() {
  const ctx = await requirePermission(PERM.material.grn.view);

  const lookups = ctx.has(PERM.material.grn.create) ? await grnLookups(ctx) : null;

  const grns = await prisma.grn.findMany({
    where: { purchaseOrder: projectScopeFilter(ctx) },
    orderBy: { grnDate: "desc" },
    take: 100,
    include: {
      store: { select: { name: true } },
      vendor: { select: { name: true } },
      purchaseOrder: { select: { poNo: true, id: true } },
      items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true } },
    },
  });

  const awaitingPost = grns.filter((g) => g.status === "INSPECTED").length;

  const columns: Column<GrnRow>[] = [
    {
      key: "grn",
      header: "Receipt",
      render: (g) => (
        <div>
          <Link href={`/material/grn/${g.id}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
            {g.grnNo}
          </Link>
          <p className="text-xs text-muted-500">
            against{" "}
            <Link href={`/material/purchase-orders/${g.purchaseOrder.id}`} className="hover:text-brand-600">
              {g.purchaseOrder.poNo}
            </Link>
          </p>
        </div>
      ),
    },
    { key: "vendor", header: "Vendor", render: (g) => <span className="text-sm">{g.vendor.name}</span> },
    { key: "store", header: "Store", render: (g) => <span className="text-xs text-muted-600">{g.store.name}</span> },
    {
      key: "challan",
      header: "Challan",
      render: (g) => <span className="text-xs text-muted-600">{g.challanNo ?? "—"}</span>,
    },
    { key: "date", header: "Received", render: (g) => <span className="text-xs text-muted-500">{formatDate(g.grnDate)}</span> },
    {
      key: "accepted",
      header: "Accepted",
      align: "right",
      className: "num",
      render: (g) => {
        const accepted = g.items.reduce((s, i) => s + Number(i.acceptedQty), 0);
        const received = g.items.reduce((s, i) => s + Number(i.receivedQty), 0);
        return (
          <span className="text-xs">
            <span className="font-medium text-good-700">{qty(accepted, 2)}</span>
            <span className="text-muted-400"> / {qty(received, 2)}</span>
          </span>
        );
      },
    },
    {
      key: "rejected",
      header: "Rejected",
      align: "right",
      className: "num",
      render: (g) => {
        const rejected = g.items.reduce((s, i) => s + Number(i.rejectedQty), 0);
        return rejected > 0
          ? <span className="text-xs font-medium text-bad-600">{qty(rejected, 2)}</span>
          : <span className="text-xs text-muted-400">—</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (g) => <Badge tone={STATUS_TONE[g.status] ?? "slate"}>{g.status}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Goods Receipt"
        description="Accepted, rejected and short quantities recorded against the challan. Only accepted stock enters the ledger."
        actions={
          <div className="flex items-center gap-2">
            {awaitingPost > 0 && <Badge tone="warn">{awaitingPost} inspected, not posted</Badge>}
            {ctx.has(PERM.material.grn.create) && (
              <NewGrnDrawer openPos={lookups!.openPos} stores={lookups!.stores} />
            )}
          </div>
        }
      />

      {grns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageCheck className="h-8 w-8" />}
            title="Nothing received yet"
            description="A goods receipt is recorded against an approved purchase order, with the challan photographed at the gate."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={grns} rowKey={(g) => g.id} dense />
      )}
    </div>
  );
}
