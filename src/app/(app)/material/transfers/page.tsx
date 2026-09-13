import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, readTransferListParams, toSearchParams, TRANSFER_STATUSES, transferListWhere,
} from "@/lib/material/list-filters";
import { storeOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { PageHeader } from "@/components/ui/primitives";
import { TransfersScreen } from "./transfers-screen";

export const metadata = { title: "Store Transfers" };

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.transfer.view);
  const raw = await searchParams;
  const params = readTransferListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(
    params.q || params.status || params.fromStore || params.toStore || params.from || params.to,
  );

  const [transfers, stores, allStores, stock] = await Promise.all([
    prisma.stockTransfer.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: transferListWhere(params),
      orderBy: { transferDate: "desc" },
      take: 100,
      include: {
        fromStore: { select: { name: true } },
        toStore: { select: { name: true } },
        items: { include: { item: { select: { name: true, uom: { select: { code: true } } } } } },
      },
    }),
    prisma.store.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    storeOptions(),
    prisma.stockBalance.findMany({
      where: { quantity: { gt: 0 } },
      include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Store Transfers"
        description="Inter-store movement, approved before stock leaves and confirmed on arrival — so nothing goes missing in transit."
      />

      <ListToolbar
        searchPlaceholder="Search transfer, store, item, remarks…"
        filters={[
          { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(TRANSFER_STATUSES) },
          { name: "fromStore", label: "From store", allLabel: "From any store", options: allStores },
          { name: "toStore", label: "To store", allLabel: "To any store", options: allStores },
        ]}
        dateRange={{ label: "Transferred" }}
        count={transfers.length}
      >
        {ctx.has(PERM.material.transfer.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/transfers/export", format, query)}
            disabled={transfers.length === 0}
          />
        )}
      </ListToolbar>

      <TransfersScreen
        filtered={filtered}
        transfers={transfers.map((t) => ({
          id: t.id,
          transferNo: t.transferNo,
          transferDate: t.transferDate.toISOString(),
          status: t.status,
          fromStoreName: t.fromStore.name,
          toStoreName: t.toStore.name,
          remarks: t.remarks,
          items: t.items.map((i) => ({
            id: i.id,
            name: i.item.name,
            uom: i.item.uom.code,
            quantity: Number(i.quantity),
            receivedQty: Number(i.receivedQty),
          })),
        }))}
        stores={stores}
        stock={stock.map((b) => ({
          itemId: b.item.id,
          storeId: b.storeId,
          code: b.item.code,
          name: b.item.name,
          uom: b.item.uom.code,
          available: Number(b.quantity),
        }))}
        can={{
          create: ctx.has(PERM.material.transfer.create),
          approve: ctx.has(PERM.material.transfer.approve),
          receive: ctx.has(PERM.material.transfer.receive),
        }}
      />
    </div>
  );
}
