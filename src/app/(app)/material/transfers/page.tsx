import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { TransfersScreen } from "./transfers-screen";

export const metadata = { title: "Store Transfers" };

export default async function TransfersPage() {
  const ctx = await requirePermission(PERM.material.transfer.view);

  const [transfers, stores, stock] = await Promise.all([
    prisma.stockTransfer.findMany({
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

      <TransfersScreen
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
