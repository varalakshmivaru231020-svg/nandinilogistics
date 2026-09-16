import Link from "next/link";
import { qty } from "@/lib/utils";
import { PackageCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { grnListWhere, grnMatch, readGrnListParams } from "@/lib/material/list-filters";
import { vendorOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
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


  const [grns, vendors] = await Promise.all([
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
            item: { select: { name: true, uom: { select: { code: true } } } },
          },
        },
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
            title={filtered ? "No goods receipts match these filters" : "Nothing received yet"}
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
          {grns.map((g) => {
            const accepted = g.items.reduce((n, i) => n + Number(i.acceptedQty), 0);
            const rejected = g.items.reduce((n, i) => n + Number(i.rejectedQty), 0);
            const short = g.items.reduce((n, i) => n + Number(i.shortQty), 0);
            // The design names the first line and what it delivered of its order.
            const first = g.items[0];
            const ordered = first ? Number(first.poItem?.orderedQty ?? 0) : 0;
            const item = first
              ? `${first.item.name} · ${qty(first.receivedQty, 3)}${ordered ? ` of ${qty(ordered, 3)}` : ""} ${first.item.uom.code}` +
                (g.items.length > 1 ? ` +${g.items.length - 1}` : "")
              : "—";

            return (
              <GrnCard
                key={g.id}
                grn={{
                  id: g.id,
                  item,
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

      <ListNote>
        Three-way match: PO ↔ GRN ↔ Invoice. A mismatch is blocked or flagged — never quietly paid. Only accepted stock enters the ledger.
      </ListNote>
    </div>
  );
}
