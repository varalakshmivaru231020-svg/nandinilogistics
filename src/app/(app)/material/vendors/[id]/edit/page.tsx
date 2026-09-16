import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { VendorForm } from "../../vendor-form";

export const metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERM.masters.vendor.update);

  const [vendor, categories] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id },
      include: {
        paymentTerm: { select: { name: true } },
        categories: { select: { itemCategoryId: true } },
      },
    }),
    prisma.itemCategory.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!vendor) notFound();

  return (
    <VendorForm
      categories={categories}
      vendor={{
        id: vendor.id,
        code: vendor.code,
        name: vendor.name,
        contactPerson: vendor.contactPerson ?? "",
        phone: vendor.phone ?? "",
        email: vendor.email ?? "",
        gstin: vendor.gstin ?? "",
        pan: vendor.pan ?? "",
        paymentTerms: vendor.paymentTerm?.name ?? "",
        accountNumber: vendor.accountNumber ?? "",
        ifsc: vendor.ifsc ?? "",
        bankName: vendor.bankName ?? "",
        upiId: vendor.upiId ?? "",
        addressLine: vendor.addressLine ?? "",
        categoryIds: vendor.categories.map((c) => c.itemCategoryId),
      }}
    />
  );
}
