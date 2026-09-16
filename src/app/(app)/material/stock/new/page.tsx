import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ItemForm } from "../item-form";

export const metadata = { title: "New item" };

export default async function NewItemPage() {
  await requirePermission(PERM.masters.item.create);
  const units = await prisma.uom.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  return <ItemForm units={units} />;
}
