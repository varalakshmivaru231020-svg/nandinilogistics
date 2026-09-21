import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, money } from "@/lib/utils";
import { GrnForm } from "./grn-form";
import { GrnPoPicker } from "./po-picker";
import { projectScopeFilter } from "@/lib/rbac/context";

export const metadata = { title: "Receive Material" };

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.grn.create);
  const { po: poId } = await searchParams;

  const scope = projectScopeFilter(ctx);

  // Purchase orders still expecting material.
  const openPos = await prisma.purchaseOrder.findMany({
    where: { ...scope, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
    orderBy: { poDate: "asc" },
    take: 50,
    include: {
      vendor: { select: { name: true } },
      project: { select: { code: true } },
      _count: { select: { items: true } },
    },
  });

  const po = poId
    ? await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          vendor: { select: { name: true } },
          project: { select: { id: true, code: true, name: true } },
          items: {
            include: { item: { select: { id: true, code: true, name: true, uom: { select: { name: true } } } } },
          },
        },
      })
    : null;

  const stores = await prisma.store.findMany({
    where: { status: "ACTIVE", ...(po ? { OR: [{ projectId: po.projectId }, { projectId: null }] } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  if (!po) {
    return (
      <GrnPoPicker
        pos={openPos.map((p) => ({
          id: p.id,
          poNo: p.poNo,
          status: p.status,
          vendor: p.vendor.name,
          items: `${p._count.items} line${p._count.items === 1 ? "" : "s"}${p.expectedDate ? ` · expected ${formatDate(p.expectedDate)}` : ""}`,
          value: money(Number(p.totalAmount)),
        }))}
      />
    );
  }

  return (
    <GrnForm
      po={{
        id: po.id,
        poNo: po.poNo,
        vendorName: po.vendor.name,
        projectCode: po.project.code,
        projectName: po.project.name,
      }}
      stores={stores}
      lines={po.items.map((l) => ({
        poItemId: l.id,
        itemId: l.item.id,
        code: l.item.code,
        name: l.item.name,
        uom: l.item.uom.name,
        orderedQty: Number(l.orderedQty),
        alreadyReceived: Number(l.receivedQty),
        rate: Number(l.rate),
      }))}
    />
  );
}
