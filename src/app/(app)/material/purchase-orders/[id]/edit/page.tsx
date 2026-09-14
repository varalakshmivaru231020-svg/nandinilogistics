import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isPoEditable } from "@/lib/material/procurement";
import { PageHeader } from "@/components/ui/primitives";
import { PoForm } from "../../new/po-form";
import { poLookups } from "../../lookups";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: po ? `Edit ${po.poNo}` : "Edit Purchase Order" };
}

export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(
    PERM.material.purchaseOrder.view,
    PERM.material.purchaseOrder.update,
    PERM.material.purchaseOrder.viewRate,
  );

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      vendor: { select: { id: true, name: true, paymentTermId: true } },
      items: true,
    },
  });
  if (!po) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(po.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }
  // Approved since the button was shown — the detail screen explains the state.
  if (!isPoEditable(po)) redirect(`/material/purchase-orders/${id}`);

  const lookups = await poLookups(ctx);

  // An order may reference a vendor or item deactivated since; keep them selectable.
  const vendors = lookups.vendors.some((v) => v.id === po.vendorId)
    ? lookups.vendors
    : [po.vendor, ...lookups.vendors];
  const knownItems = new Set(lookups.items.map((i) => i.id));
  const missingItemIds = po.items.map((l) => l.itemId).filter((itemId) => !knownItems.has(itemId));
  const missingItems = missingItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: missingItemIds } },
        select: {
          id: true, code: true, name: true, standardRate: true,
          uom: { select: { code: true } }, taxRate: { select: { percentage: true } },
        },
      })
    : [];
  const items = [
    ...lookups.items,
    ...missingItems.map((i) => ({
      id: i.id, code: i.code, name: i.name, uom: i.uom.code,
      standardRate: Number(i.standardRate), taxPct: i.taxRate ? Number(i.taxRate.percentage) : 0,
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Edit ${po.poNo}`}
        description="Nobody has approved this order yet, so it is changed in place. The PO number stays the same."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/purchase-orders" className="hover:text-brand-600">Purchase Orders</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/material/purchase-orders/${po.id}`} className="hover:text-brand-600">{po.poNo}</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Edit</span>
          </span>
        }
      />

      <PoForm
        projects={[]}
        vendors={vendors}
        terms={lookups.terms}
        items={items}
        openIndents={[]}
        prefill={null}
        edit={{
          poId: po.id,
          projectLabel: `${po.project.code} — ${po.project.name}`,
          initial: {
            vendorId: po.vendorId,
            paymentTermId: po.paymentTermId ?? "",
            expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : "",
            deliveryAddress: po.deliveryAddress ?? "",
            terms: po.terms ?? "",
            otherCharges: Number(po.otherCharges),
            lines: po.items.map((l) => ({
              id: l.id,
              itemId: l.itemId,
              orderedQty: Number(l.orderedQty),
              receivedQty: Number(l.receivedQty),
              rate: Number(l.rate),
              discountPct: Number(l.discountPct),
              taxPct: Number(l.taxPct),
              specification: l.specification ?? "",
            })),
          },
        }}
      />
    </div>
  );
}
