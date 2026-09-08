import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { money, moneyShort, qty } from "@/lib/utils";

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
  const belowReorder = balances.filter(
    (b) => Number(b.item.reorderLevel) > 0 && Number(b.quantity) <= Number(b.item.reorderLevel),
  ).length;

  const columns: Column<StockRow>[] = [
    {
      key: "item",
      header: "Item",
      render: (b) => (
        <div>
          <p className="text-sm text-slate-800">{b.item.name}</p>
          <p className="text-xs text-slate-500"><code>{b.item.code}</code> · {b.item.category.name}</p>
        </div>
      ),
    },
    { key: "store", header: "Store", render: (b) => <span className="text-xs text-slate-600">{b.store.name}</span> },
    {
      key: "qty",
      header: "On hand",
      align: "right",
      className: "num",
      render: (b) => {
        const low = Number(b.item.reorderLevel) > 0 && Number(b.quantity) <= Number(b.item.reorderLevel);
        return (
          <span className={low ? "font-semibold text-red-600" : "text-slate-800"}>
            {qty(b.quantity, 3)} {b.item.uom.code}
          </span>
        );
      },
    },
    {
      key: "reorder",
      header: "Reorder level",
      align: "right",
      className: "num",
      render: (b) => <span className="text-xs text-slate-500">{qty(b.item.reorderLevel, 3)}</span>,
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
      render: (b) => <span className="font-medium text-slate-900">{money(b.value)}</span>,
    },
    {
      key: "flag",
      header: "",
      align: "center",
      render: (b) => {
        const low = Number(b.item.reorderLevel) > 0 && Number(b.quantity) <= Number(b.item.reorderLevel);
        return low ? <Badge tone="red">Reorder</Badge> : null;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Live Stock"
        description="Item-wise position per store, valued at weighted average."
        actions={
          <div className="flex items-center gap-2">
            {belowReorder > 0 && <Badge tone="red">{belowReorder} below reorder</Badge>}
            {showValuation && <Badge tone="brand">{moneyShort(totalValue)} on hand</Badge>}
          </div>
        }
      />

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
