import Link from "next/link";
import { ChevronRight, PackageSearch } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, money } from "@/lib/utils";
import { GrnForm } from "./grn-form";

export const metadata = { title: "Receive Material" };

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.grn.create);
  const { po: poId } = await searchParams;

  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };

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
            include: { item: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } },
          },
        },
      })
    : null;

  const stores = await prisma.store.findMany({
    where: { status: "ACTIVE", ...(po ? { OR: [{ projectId: po.projectId }, { projectId: null }] } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Receive material"
        description="Record what actually arrived — accepted, rejected and short — against the challan."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/grn" className="hover:text-brand-600">Goods Receipt</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      {!po ? (
        openPos.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PackageSearch className="h-8 w-8" />}
              title="No purchase orders awaiting delivery"
              description="Material can only be received against an approved purchase order."
            />
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Which purchase order arrived?</CardTitle>
              <span className="text-xs text-slate-500">{openPos.length} awaiting delivery</span>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100">
                {openPos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/material/grn/new?po=${p.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.poNo}</p>
                        <p className="text-xs text-slate-500">
                          {p.project.code} · {p.vendor.name} · {p._count.items} line(s)
                          {p.expectedDate && ` · expected ${formatDate(p.expectedDate)}`}
                        </p>
                      </div>
                      <span className="num text-sm text-slate-600">{money(p.totalAmount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )
      ) : (
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
            uom: l.item.uom.code,
            orderedQty: Number(l.orderedQty),
            alreadyReceived: Number(l.receivedQty),
            rate: Number(l.rate),
          }))}
        />
      )}
    </div>
  );
}
