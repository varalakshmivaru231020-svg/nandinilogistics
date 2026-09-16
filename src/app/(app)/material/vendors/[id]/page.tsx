import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { MASTERS } from "@/lib/masters/registry";
import { loadOptions } from "@/lib/masters/service";
import { moneyShort, qty } from "@/lib/utils";
import { VendorDetail } from "./vendor-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.vendor.findUnique({ where: { id }, select: { name: true } });
  return { title: v?.name ?? "Vendor" };
}

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.vendor.view);

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      city: { select: { name: true } },
      paymentTerm: { select: { name: true } },
      categories: { include: { category: { select: { name: true } } } },
      purchaseOrders: {
        orderBy: { poDate: "desc" },
        select: {
          id: true, poNo: true, status: true, totalAmount: true, expectedDate: true,
          items: {
            select: {
              orderedQty: true,
              item: { select: { name: true, uom: { select: { code: true } } } },
            },
          },
          grns: { select: { grnDate: true } },
        },
      },
    },
  });
  if (!vendor) notFound();

  const vendorMaster = MASTERS.find((m) => m.key === "vendors")!;
  const options = await loadOptions(vendorMaster);

  // On-time is measured where it can be: orders that were received, against the
  // date the order promised.
  const delivered = vendor.purchaseOrders.filter((p) => p.grns.length > 0 && p.expectedDate);
  const onTime = delivered.filter(
    (p) => Math.min(...p.grns.map((g) => g.grnDate.getTime())) <= p.expectedDate!.getTime(),
  ).length;
  const spend = vendor.purchaseOrders.reduce((s, p) => s + Number(p.totalAmount), 0);

  const initials = vendor.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dash = (v: string | null | undefined) => (v && v.trim()) || "—";

  return (
    <VendorDetail
      vendor={{
        id: vendor.id,
        name: vendor.name,
        code: vendor.code,
        initials,
        active: vendor.status === "ACTIVE",
        rating: vendor.rating ? vendor.rating.toFixed(1) : "—",
        onTime: delivered.length ? `${Math.round((onTime / delivered.length) * 100)}%` : "—",
        spend: moneyShort(spend),
      }}
      rows={[
        { k: "Contact person", v: dash(vendor.contactPerson) },
        { k: "Mobile", v: dash(vendor.phone) },
        { k: "Email", v: dash(vendor.email) },
        { k: "Supply categories", v: vendor.categories.map((c) => c.category.name).join(" · ") || "—" },
        { k: "GSTIN", v: dash(vendor.gstin) },
        { k: "PAN", v: dash(vendor.pan) },
        { k: "Payment terms", v: dash(vendor.paymentTerm?.name) },
        { k: "Bank account number", v: dash(vendor.accountNumber) },
        { k: "IFSC code", v: dash(vendor.ifsc) },
        { k: "Bank & branch", v: dash(vendor.bankName) },
        { k: "UPI ID", v: dash(vendor.upiId) },
        { k: "Address", v: [vendor.addressLine, vendor.city?.name, vendor.pincode].filter(Boolean).join(", ") || "—" },
      ]}
      orders={vendor.purchaseOrders.map((p) => {
        const first = p.items[0];
        return {
          id: p.id,
          poNo: p.poNo,
          status: p.status,
          items: first
            ? `${first.item.name} · ${qty(Number(first.orderedQty), 3)} ${first.item.uom.code}${p.items.length > 1 ? ` +${p.items.length - 1} more` : ""}`
            : "No lines",
          value: moneyShort(Number(p.totalAmount)),
        };
      })}
      master={{
        def: vendorMaster,
        options,
        record: {
          id: vendor.id,
          code: vendor.code,
          name: vendor.name,
          contactPerson: vendor.contactPerson,
          phone: vendor.phone,
          email: vendor.email,
          gstin: vendor.gstin,
          pan: vendor.pan,
          cityId: vendor.cityId,
          addressLine: vendor.addressLine,
          pincode: vendor.pincode,
          paymentTermId: vendor.paymentTermId,
          bankName: vendor.bankName,
          accountNumber: vendor.accountNumber,
          ifsc: vendor.ifsc,
          upiId: vendor.upiId,
          rating: vendor.rating,
          status: vendor.status,
        },
      }}
      can={{
        raisePo: ctx.has(PERM.material.purchaseOrder.create),
        update: ctx.has(PERM.masters.vendor.update),
        delete: ctx.has(PERM.masters.vendor.delete),
      }}
    />
  );
}
