import { PackageCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, GRN_STATUSES, grnListWhere, grnMatch, readGrnListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { grnLookups } from "./lookups";
import { NewGrnDrawer } from "./new-grn-drawer";
import { GrnCard } from "./grn-card";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Goods Receipt" };

export default async function GrnListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.grn.view);
  const raw = await searchParams;
  const params = readGrnListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);

  const lookups = ctx.has(PERM.material.grn.create) ? await grnLookups(ctx) : null;

  const [grns, projects] = await Promise.all([
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
        items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true, shortQty: true } },
      },
    }),
    projectOptions(ctx),
  ]);

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

      <ListToolbar
        searchPlaceholder="Search GRN, PO, vendor or challan…"
        filters={[
          { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(GRN_STATUSES) },
          { name: "project", label: "Projects", options: projects },
        ]}
        dateRange={{ label: "Received" }}
        count={grns.length}
      >
        {ctx.has(PERM.material.grn.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/grn/export", format, query)}
            disabled={grns.length === 0}
          />
        )}
      </ListToolbar>

      {grns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageCheck className="h-8 w-8" />}
            title={filtered ? "No goods receipts match these filters" : "Nothing received yet"}
            description="A goods receipt is recorded against an approved purchase order, with the challan photographed at the gate."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {grns.map((g) => {
            const accepted = g.items.reduce((n, i) => n + Number(i.acceptedQty), 0);
            const rejected = g.items.reduce((n, i) => n + Number(i.rejectedQty), 0);
            const short = g.items.reduce((n, i) => n + Number(i.shortQty), 0);

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
                  // Where this receipt sits in the three-way match — the export says the same.
                  match: grnMatch(g.status, rejected, short, g.purchaseOrder._count.invoices),
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
