import Link from "next/link";
import { PackageCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { grnListWhere, grnMatch, readGrnListParams } from "@/lib/material/list-filters";
import { vendorOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ModuleStats } from "@/components/list/module-stats";
import { grnFigures } from "@/lib/metrics/figures";
import { ListNote } from "@/components/list/list-note";
import { grnEmpty, grnLineSummary, GRN_NOTE } from "@/lib/screens/rows/grn";
import { GrnCard } from "./grn-card";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Goods Receipt · GRN" };

export default async function GrnListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.grn.view);
  const raw = await searchParams;
  const params = readGrnListParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);


  const nowMs = new Date().getTime();
  const inScope = grnListWhere(ctx, { ...params, q: "", status: null, project: null, from: undefined, to: undefined });

  const [grns, statRows, vendors] = await Promise.all([
    prisma.grn.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: grnListWhere(ctx, params),
      orderBy: { grnDate: "desc" },
      take: 100,
      include: {
        store: { select: { name: true } },
        vendor: { select: { name: true } },
        inspectedBy: { select: { name: true } },
        purchaseOrder: {
          select: { poNo: true, id: true, _count: { select: { invoices: true } } },
        },
        items: {
          select: {
            receivedQty: true, acceptedQty: true, rejectedQty: true, shortQty: true,
            poItem: { select: { orderedQty: true } },
            item: { select: { name: true, uom: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.grn.findMany({
      where: inScope,
      select: {
        status: true, grnDate: true,
        items: { select: { acceptedQty: true, rejectedQty: true } },
      },
    }),
    vendorOptions(),
  ]);


  return (
    <div>
      <PageHeader
        title="Goods Receipt · GRN"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
        actions={
          ctx.has(PERM.material.grn.create) ? (
            <Link
              href="/material/grn/new"
              className="rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New GRN
            </Link>
          ) : null
        }
      />

      <ModuleStats
        figures={grnFigures(
          statRows.map((g) => ({ status: g.status, receivedAt: g.grnDate, items: g.items })),
          nowMs,
        )}
      />

      <ListToolbar
        searchPlaceholder="Search GRN no., PO, vendor, receiver…"
        filters={[
          { name: "vendor", label: "Vendor", options: vendors },
          {
            name: "invoice",
            label: "Invoice",
            options: [
              { value: "PENDING", label: "Invoice pending" },
              { value: "ATTACHED", label: "Invoice attached" },
            ],
          },
        ]}
        dateRange={{ label: "Received" }}
        count={grns.length}
        countNoun="receipts"
      />

      {grns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageCheck className="h-8 w-8" />}
            title={grnEmpty(filtered).title}
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
          {grns.map((g) => {
            const { accepted, rejected, short, unit, item } = grnLineSummary(g.items);

            return (
              <GrnCard
                key={g.id}
                grn={{
                  id: g.id,
                  item,
                  unit,
                  grnNo: g.grnNo,
                  poNo: g.purchaseOrder.poNo,
                  poId: g.purchaseOrder.id,
                  vendor: g.vendor.name,
                  grnDate: g.grnDate.toISOString(),
                  store: g.store.name,
                  lineCount: g.items.length,
                  challanNo: g.challanNo,
                  hasChallanPhoto: Boolean(g.challanPhotoUrl),
                  inspectedBy: g.inspectedBy?.name ?? null,
                  accepted, rejected, short,
                  status: g.status,
                  // Where this receipt sits in the three-way match — the export says the same.
                  match: grnMatch(g.status, rejected, short, g.purchaseOrder._count.invoices),
                }}
              />
            );
          })}
        </div>
      )}

      <ListNote>{GRN_NOTE}</ListNote>
    </div>
  );
}
