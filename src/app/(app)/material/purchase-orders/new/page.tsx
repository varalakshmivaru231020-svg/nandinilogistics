import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { PoForm } from "./po-form";

export const metadata = { title: "New Purchase Order" };

export default async function NewPoPage({
  searchParams,
}: {
  searchParams: Promise<{ indent?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.purchaseOrder.create);
  const { indent: indentId } = await searchParams;

  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };

  const [projects, vendors, terms, items, sourceIndent, openIndents] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectWhere, status: { in: ["PLANNING", "ACTIVE"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.vendor.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, paymentTermId: true } }),
    prisma.paymentTerm.findMany({ where: { status: "ACTIVE" }, orderBy: { days: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true, standardRate: true,
        uom: { select: { code: true } },
        taxRate: { select: { percentage: true } },
      },
    }),
    indentId
      ? prisma.indent.findUnique({
          where: { id: indentId },
          include: { items: { include: { item: { select: { id: true, name: true } } } }, project: { select: { id: true } } },
        })
      : Promise.resolve(null),
    // Approved indents with a purchase shortfall still to be ordered.
    prisma.indent.findMany({
      where: {
        status: "ADMIN_APPROVED",
        ...(ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } }),
      },
      orderBy: { raisedAt: "asc" },
      take: 50,
      select: { id: true, indentNo: true, purpose: true, projectId: true },
    }),
  ]);

  // Pre-fill from the indent: only the shortfall the stock check left behind.
  const prefill = sourceIndent
    ? {
        projectId: sourceIndent.projectId,
        indentId: sourceIndent.id,
        indentNo: sourceIndent.indentNo,
        lines: sourceIndent.items
          .map((l) => ({
            itemId: l.itemId,
            // toPurchaseQty is set by the stock check; fall back to the approved quantity.
            qty: Number(l.toPurchaseQty) > 0
              ? Number(l.toPurchaseQty)
              : Number(l.approvedQty ?? l.requestedQty),
            rate: Number(l.estimatedRate),
            specification: l.specification ?? "",
          }))
          .filter((l) => l.qty > 0),
      }
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="New purchase order"
        description="Raised against an approved indent, carrying only the shortfall the stock check left to buy."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/purchase-orders" className="hover:text-brand-600">Purchase Orders</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <PoForm
        projects={projects}
        vendors={vendors}
        terms={terms}
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          uom: i.uom.code,
          standardRate: Number(i.standardRate),
          taxPct: i.taxRate ? Number(i.taxRate.percentage) : 0,
        }))}
        openIndents={openIndents}
        prefill={prefill}
      />
    </div>
  );
}
