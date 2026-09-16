import { redirect } from "next/navigation";

import { requireAnyPermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ProcurementScreen, type ProcTab } from "./procurement-screen";

export const metadata = { title: "Procurement" };

const TABS: Array<{ key: ProcTab; label: string; perm: string }> = [
  { key: "indents", label: "Indents", perm: PERM.material.indent.view },
  { key: "pos", label: "Purchase orders", perm: PERM.material.purchaseOrder.view },
  { key: "grns", label: "Goods receipt", perm: PERM.material.grn.view },
  { key: "vendors", label: "Vendors", perm: PERM.masters.vendor.view },
  { key: "items", label: "Items", perm: PERM.masters.item.view },
];

/**
 * The Procurement screen from design/NN Infra Admin.dc.html: one screen with
 * tabs across the chain, rather than five separate pages.
 */
export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; a?: string; b?: string }>;
}) {
  const ctx = await requireAnyPermission(
    PERM.material.indent.view,
    PERM.material.purchaseOrder.view,
    PERM.material.grn.view,
    PERM.masters.vendor.view,
    PERM.masters.item.view,
  );

  const { tab: tabParam, q = "", a = "all", b = "all" } = await searchParams;
  const available = TABS.filter((t) => ctx.has(t.perm));
  if (available.length === 0) redirect("/dashboard");

  const tab = (available.find((t) => t.key === tabParam)?.key ?? available[0].key) as ProcTab;
  const scope = projectScopeFilter(ctx);
  const search = q.trim();

  /* --------------------------------- Indents ------------------------------- */
  const indents =
    tab === "indents"
      ? await prisma.indent.findMany({
          where: {
            ...scope,
            ...(ctx.has(PERM.material.indent.viewAll) ? {} : { raisedById: ctx.id }),
            ...(search
              ? {
                  OR: [
                    { indentNo: { contains: search, mode: "insensitive" as const } },
                    { purpose: { contains: search, mode: "insensitive" as const } },
                  ],
                }
              : {}),
            ...(a !== "all" ? { status: a as never } : {}),
          },
          orderBy: { raisedAt: "desc" },
          take: 40,
          include: {
            project: { select: { code: true } },
            raisedBy: { select: { name: true } },
            workPackage: { select: { name: true } },
            items: { select: { issueFromStockQty: true, toPurchaseQty: true, requestedQty: true, approvedQty: true } },
            _count: { select: { items: true } },
          },
        })
      : [];

  /* ------------------------------ Purchase orders -------------------------- */
  const pos =
    tab === "pos"
      ? await prisma.purchaseOrder.findMany({
          where: {
            ...scope,
            ...(search ? { poNo: { contains: search, mode: "insensitive" as const } } : {}),
            ...(a !== "all" ? { status: a as never } : {}),
          },
          orderBy: { poDate: "desc" },
          take: 40,
          include: {
            project: { select: { code: true } },
            vendor: { select: { name: true } },
            items: {
              select: { orderedQty: true, receivedQty: true, indent: { select: { indentNo: true } } },
            },
            _count: { select: { grns: true, invoices: true } },
          },
        })
      : [];

  /* ------------------------------- Goods receipt --------------------------- */
  const grns =
    tab === "grns"
      ? await prisma.grn.findMany({
          where: {
            purchaseOrder: scope,
            ...(search ? { grnNo: { contains: search, mode: "insensitive" as const } } : {}),
            ...(a !== "all" ? { status: a as never } : {}),
          },
          orderBy: { grnDate: "desc" },
          take: 40,
          include: {
            vendor: { select: { name: true } },
            store: { select: { name: true } },
            purchaseOrder: { select: { id: true, poNo: true } },
            items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true } },
          },
        })
      : [];

  /* --------------------------------- Vendors ------------------------------- */
  const vendors =
    tab === "vendors"
      ? await prisma.vendor.findMany({
          where: search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { code: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {},
          orderBy: { name: "asc" },
          take: 60,
          include: {
            city: { select: { name: true } },
            paymentTerm: { select: { name: true } },
            _count: { select: { purchaseOrders: true, invoices: true } },
          },
        })
      : [];

  /* ---------------------------------- Items -------------------------------- */
  const items =
    tab === "items"
      ? await prisma.item.findMany({
          where: search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { code: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {},
          orderBy: { name: "asc" },
          take: 60,
          include: {
            category: { select: { name: true } },
            uom: { select: { name: true } },
            stockBalances: { select: { quantity: true } },
          },
        })
      : [];

  const showMoney = ctx.has(PERM.material.purchaseOrder.viewRate);

  return (
    <ProcurementScreen
      tab={tab}
      nowMs={new Date().getTime()}
      tabs={available.map((t) => ({ key: t.key, label: t.label }))}
      query={q}
      filterA={a}
      filterB={b}
      showMoney={showMoney}
      can={{
        createIndent: ctx.has(PERM.material.indent.create),
        createPo: ctx.has(PERM.material.purchaseOrder.create),
        createGrn: ctx.has(PERM.material.grn.create),
      }}
      indents={indents.map((i) => {
        const fromStock = i.items.reduce((s, l) => s + Number(l.issueFromStockQty), 0);
        const toBuy = i.items.reduce((s, l) => s + Number(l.toPurchaseQty), 0);
        return {
          id: i.id,
          title: i.purpose ?? `Material indent`,
          ref: i.indentNo,
          project: i.project.code,
          by: i.raisedBy.name,
          raisedAt: i.raisedAt.toISOString(),
          requiredBy: i.requiredByDate.toISOString(),
          activity: i.workPackage?.name ?? null,
          status: i.status,
          lineCount: i._count.items,
          value: Number(i.estimatedValue),
          fromStock,
          toBuy,
        };
      })}
      pos={pos.map((p) => ({
        id: p.id,
        no: p.poNo,
        project: p.project.code,
        vendor: p.vendor.name,
        poDate: p.poDate.toISOString(),
        expectedDate: p.expectedDate?.toISOString() ?? null,
        status: p.status,
        total: Number(p.totalAmount),
        ordered: p.items.reduce((s, l) => s + Number(l.orderedQty), 0),
        received: p.items.reduce((s, l) => s + Number(l.receivedQty), 0),
        indentNo: p.items.find((l) => l.indent)?.indent?.indentNo ?? null,
        grnCount: p._count.grns,
        invoiceCount: p._count.invoices,
      }))}
      grns={grns.map((g) => ({
        id: g.id,
        no: g.grnNo,
        poId: g.purchaseOrder.id,
        poNo: g.purchaseOrder.poNo,
        vendor: g.vendor.name,
        store: g.store.name,
        grnDate: g.grnDate.toISOString(),
        challanNo: g.challanNo,
        status: g.status,
        received: g.items.reduce((s, l) => s + Number(l.receivedQty), 0),
        accepted: g.items.reduce((s, l) => s + Number(l.acceptedQty), 0),
        rejected: g.items.reduce((s, l) => s + Number(l.rejectedQty), 0),
      }))}
      vendors={vendors.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        contact: v.contactPerson,
        phone: v.phone,
        gstin: v.gstin,
        city: v.city?.name ?? null,
        term: v.paymentTerm?.name ?? null,
        rating: v.rating,
        status: v.status,
        poCount: v._count.purchaseOrders,
        invoiceCount: v._count.invoices,
      }))}
      items={items.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        category: i.category.name,
        uom: i.uom.name,
        reorderLevel: Number(i.reorderLevel),
        standardRate: Number(i.standardRate),
        onHand: i.stockBalances.reduce((s, b) => s + Number(b.quantity), 0),
        status: i.status,
      }))}
    />
  );
}
