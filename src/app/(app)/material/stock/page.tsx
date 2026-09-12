import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn, money, moneyShort, qty } from "@/lib/utils";

export const metadata = { title: "Stock" };

type StockRow = {
  id: string;
  quantity: unknown;
  avgRate: unknown;
  value: unknown;
  item: { code: string; name: string; reorderLevel: unknown; uom: { code: string }; category: { name: string } };
  store: { code: string; name: string };
};

export default async function StockPage() {
  const ctx = await requirePermission(PERM.material.stock.view);
  const showValuation = ctx.has(PERM.material.stock.viewValuation);

  const balances = await prisma.stockBalance.findMany({
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
  });

  const totalValue = balances.reduce((s, b) => s + Number(b.value), 0);
  // Strictly below the level, matching the design's "Restock now" band.
  const lowRows = balances.filter(
    (b) => Number(b.item.reorderLevel) > 0 && Number(b.quantity) < Number(b.item.reorderLevel),
  );
  const belowReorder = lowRows.length;
  const canRaisePo = ctx.has(PERM.material.purchaseOrder.create);

  /**
   * The design's three stock states, with its own 25% buffer band above the
   * reorder level — so "order soon" arrives before the shortfall does, rather
   * than at the moment it is already too late.
   */
  function stockState(onHand: number, reorder: number) {
    if (reorder <= 0) return { label: "—", tone: "muted" as const, short: 0 };
    if (onHand < reorder) {
      return { label: "Restock now", tone: "bad" as const, short: reorder - onHand };
    }
    if (onHand < reorder * 1.25) return { label: "Order soon", tone: "warn" as const, short: 0 };
    return { label: "Healthy", tone: "good" as const, short: 0 };
  }

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
    { key: "store", header: "Store", render: (b) => <span className="text-[12px] font-medium text-muted-600">{b.store.name}</span> },
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
          <div className="min-w-[110px]">
            <span
              className={cn(
                "text-[12.5px] font-bold",
                state.tone === "bad" ? "text-bad-600" : "text-navy-900",
              )}
            >
              {qty(b.quantity, 3)}
            </span>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-300">
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
            <Badge tone={state.tone}>{state.label}</Badge>
            {state.short > 0 && (
              <div className="num mt-1 text-[11px] font-semibold text-bad-600">
                short {qty(state.short, 3)} {b.item.uom.code}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "rate",
      header: "Avg. rate",
      align: "right",
      className: "num",
      visible: showValuation,
      render: (b) => money(b.avgRate, true),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      className: "num",
      visible: showValuation,
      render: (b) => <span className="font-medium text-navy-950">{money(b.value)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Item Master · Stock"
        description="Item-wise position per store, valued at weighted average. Stock moves on posted receipts and site issues."
        actions={
          <div className="flex items-center gap-2">
            {belowReorder > 0 && <Badge tone="bad">{belowReorder} below reorder</Badge>}
            {showValuation && <Badge tone="brand">{moneyShort(totalValue)} on hand</Badge>}
          </div>
        }
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

      {balances.length === 0 ? (
        <Card>
          <EmptyState title="No stock recorded yet" description="Stock enters the ledger when a goods receipt is posted." />
        </Card>
      ) : (
        <DataTable columns={columns} rows={balances} rowKey={(b) => b.id} dense />
      )}
    </div>
  );
}
