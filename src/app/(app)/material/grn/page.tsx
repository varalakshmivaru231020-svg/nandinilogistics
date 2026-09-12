import { PackageCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { grnLookups } from "./lookups";
import { NewGrnDrawer } from "./new-grn-drawer";
import { GrnCard } from "./grn-card";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Goods Receipt" };



export default async function GrnListPage() {
  const ctx = await requirePermission(PERM.material.grn.view);

  const lookups = ctx.has(PERM.material.grn.create) ? await grnLookups(ctx) : null;

  const grns = await prisma.grn.findMany({
    where: { purchaseOrder: projectScopeFilter(ctx) },
    orderBy: { grnDate: "desc" },
    take: 100,
    include: {
      store: { select: { name: true } },
      vendor: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      purchaseOrder: {
        select: { poNo: true, id: true, _count: { select: { invoices: true } } },
      },
      items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true, shortQty: true } },
    },
  });

  const awaitingPost = grns.filter((g) => g.status === "INSPECTED").length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Goods Receipt"
        description="Accepted, rejected and short quantities recorded against the challan. Only accepted stock enters the ledger."
        actions={
          <div className="flex items-center gap-2">
            {awaitingPost > 0 && <Badge tone="warn">{awaitingPost} inspected, not posted</Badge>}
            {ctx.has(PERM.material.grn.create) && (
              <NewGrnDrawer openPos={lookups!.openPos} stores={lookups!.stores} />
            )}
          </div>
        }
      />

      {grns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageCheck className="h-8 w-8" />}
            title="Nothing received yet"
            description="A goods receipt is recorded against an approved purchase order, with the challan photographed at the gate."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {grns.map((g) => {
            const accepted = g.items.reduce((n, i) => n + Number(i.acceptedQty), 0);
            const rejected = g.items.reduce((n, i) => n + Number(i.rejectedQty), 0);
            const short = g.items.reduce((n, i) => n + Number(i.shortQty), 0);

            // Where this receipt sits in the three-way match: nothing is matched
            // until it is posted, and a short or rejected line is what the match
            // is for.
            const match =
              g.status !== "POSTED"
                ? { label: "NOT POSTED", tone: "muted" as const }
                : rejected > 0 || short > 0
                  ? { label: "MATCH — WITH EXCEPTIONS", tone: "warn" as const }
                  : g.purchaseOrder._count.invoices > 0
                    ? { label: "3-WAY MATCHED", tone: "good" as const }
                    : { label: "AWAITING INVOICE", tone: "muted" as const };

            return (
              <GrnCard
                key={g.id}
                grn={{
                  id: g.id,
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
                  match,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
