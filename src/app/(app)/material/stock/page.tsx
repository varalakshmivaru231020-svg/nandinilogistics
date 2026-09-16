import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { readStockListParams, stockListWhere, stockState } from "@/lib/material/list-filters";
import { unitOptions } from "@/lib/material/list-options";
import { loadOptions } from "@/lib/masters/service";
import { MASTERS } from "@/lib/masters/registry";
import { NewMasterButton } from "@/app/(app)/masters/new-master-button";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn, qty } from "@/lib/utils";

export const metadata = { title: "Stock" };

type StockRow = {
  id: string;
  quantity: unknown;
  avgRate: unknown;
  value: unknown;
  item: { code: string; name: string; reorderLevel: unknown; uom: { code: string }; category: { name: string } };
  store: { code: string; name: string };
};

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.stock.view);
  const raw = await searchParams;
  const params = readStockListParams(raw);
  const filtered = Boolean(params.q || params.store || params.category);

  const itemMaster = MASTERS.find((m) => m.key === "items")!;

  const [balances, units, itemOptions] = await Promise.all([
    prisma.stockBalance.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: stockListWhere(params),
      orderBy: [{ store: { name: "asc" } }, { item: { name: "asc" } }],
      include: {
        item: {
          select: {
            code: true, name: true, reorderLevel: true,
            uom: { select: { code: true } },
            category: { select: { name: true } },
          },
        },
        store: { select: { code: true, name: true } },
      },
    }),
    unitOptions(),
    loadOptions(itemMaster),
  ]);

  const rows = params.stock
    ? balances.filter((b) => {
        const state = stockState(Number(b.quantity), Number(b.item.reorderLevel));
        return (
          (params.stock === "RESTOCK" && state.label === "Restock now") ||
          (params.stock === "SOON" && state.label === "Order soon") ||
          (params.stock === "HEALTHY" && state.label === "Healthy")
        );
      })
    : balances;

  // Strictly below the level, matching the design's "Restock now" band.
  const lowRows = balances.filter(
    (b) => Number(b.item.reorderLevel) > 0 && Number(b.quantity) < Number(b.item.reorderLevel),
  );
  const canRaisePo = ctx.has(PERM.material.purchaseOrder.create);

  const columns: Column<StockRow>[] = [
    {
      key: "item",
      header: "Item",
      render: (b) => (
        <div>
          <p className="text-[12.5px] font-bold text-navy-950">{b.item.name}</p>
          <p className="num text-[11px] font-medium text-muted-400">{b.item.code}</p>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (b) => <span className="text-[12px] font-medium text-muted-600">{b.item.uom.code}</span>,
    },
    {
      key: "qty",
      header: "Available stock",
      align: "right",
      className: "num",
      render: (b) => {
        const onHand = Number(b.quantity);
        const reorder = Number(b.item.reorderLevel);
        const state = stockState(onHand, reorder);
        // The bar reads against the reorder level, which is what "enough" means
        // for this item — a full bar is 125% of it, where the design stops worrying.
        const pct = reorder > 0 ? Math.min(100, Math.round((onHand / (reorder * 1.25)) * 100)) : 100;
        return (
          <div>
            <span
              className={cn(
                "text-[12.5px] font-bold",
                state.tone === "bad" ? "text-bad-600" : "text-navy-900",
              )}
            >
              {qty(b.quantity, 3)}
            </span>
            <div className="ml-auto mt-[5px] h-1.5 w-[110px] overflow-hidden rounded-full bg-[#EDF0F8]">
              <div
                className={cn(
                  "h-full rounded-full",
                  state.tone === "bad" ? "bg-bad-600" : state.tone === "warn" ? "bg-warn-700" : "bg-good-600",
                )}
                style={{ width: `${Math.max(3, pct)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "reorder",
      header: "Reorder",
      align: "right",
      className: "num",
      render: (b) => <span className="text-[12px] font-medium text-muted-500">{qty(b.item.reorderLevel, 3)}</span>,
    },
    {
      key: "status",
      header: "Stock status",
      render: (b) => {
        const state = stockState(Number(b.quantity), Number(b.item.reorderLevel));
        return (
          <div>
            <span
              className={cn(
                "inline-block whitespace-nowrap rounded-full px-[10px] py-[5px] text-[10px] font-extrabold uppercase tracking-[.06em] text-white",
                state.tone === "bad" ? "bg-bad-600" : state.tone === "warn" ? "bg-warn-700" : "bg-good-600",
              )}
            >
              {state.label}
            </span>
            {state.short > 0 && (
              <div className="num mt-1 text-[11px] font-semibold text-bad-600">
                short {qty(state.short, 3)} {b.item.uom.code}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Item Master · Stock"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
        actions={
          ctx.has(PERM.masters.item.create) ? (
            <NewMasterButton def={itemMaster} options={itemOptions} label="+ New item" />
          ) : null
        }
      />

      <ListToolbar
        searchPlaceholder="Search item name, code, specification…"
        filters={[
          { name: "unit", label: "Unit", options: units },
          {
            name: "stock",
            label: "Stock",
            options: [
              { value: "RESTOCK", label: "Restock now" },
              { value: "SOON", label: "Order soon" },
              { value: "HEALTHY", label: "Healthy" },
            ],
          },
        ]}
      />

      {/* The design's restock banner: what is short, by name, with the way out. */}
      {lowRows.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[12px] border border-bad-050 bg-bad-050 px-4 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bad-600 text-[13px] font-extrabold text-white">
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-bad-600">
              {lowRows.length} item{lowRows.length === 1 ? "" : "s"} below reorder level — raise a PO to refill stock
            </p>
            <p className="mt-0.5 truncate text-[11.5px] font-medium text-bad-600/80">
              {lowRows.map((b) => b.item.name).join(" · ")}
            </p>
          </div>
          {canRaisePo && (
            <Link
              href="/material/purchase-orders"
              className="shrink-0 rounded-[9px] bg-bad-600 px-3.5 py-2 text-[12px] font-bold text-white transition-[filter] hover:brightness-95"
            >
              Raise PO
            </Link>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? "No stock matches these filters" : "No stock recorded yet"}
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(b) => b.id} dense />
      )}

      <ListNote>
        Available stock updates from GRN receipts and site issues — items below their reorder level are flagged for a refill PO. The same records appear under Masters → Item Master.
      </ListNote>
    </div>
  );
}
