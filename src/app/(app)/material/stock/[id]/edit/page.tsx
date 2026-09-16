import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { qty } from "@/lib/utils";
import { ItemForm } from "../../item-form";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERM.masters.item.update);

  const [item, units, balance] = await Promise.all([
    prisma.item.findUnique({ where: { id } }),
    prisma.uom.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockBalance.aggregate({ where: { itemId: id }, _sum: { quantity: true } }),
  ]);
  if (!item) notFound();

  return (
    <ItemForm
      units={units}
      item={{
        id: item.id,
        code: item.code,
        name: item.name,
        uomId: item.uomId,
        reorderLevel: String(Number(item.reorderLevel)),
        specification: item.description ?? "",
        onHand: qty(Number(balance._sum.quantity ?? 0), 3),
      }}
    />
  );
}
