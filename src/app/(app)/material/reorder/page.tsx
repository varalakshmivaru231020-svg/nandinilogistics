import { TriangleAlert } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { money, qty } from "@/lib/utils";

export const metadata = { title: "Reorder Alerts" };

type Row = {
  id: string;
  code: string;
  name: string;
  uom: string;
  category: string;
  reorderLevel: number;
  onHand: number;
  standardRate: number;
};

export default async function ReorderPage() {
  const ctx = await requirePermission(PERM.material.reorder.view);

  // Alerts before you run out — total on-hand across every store vs the level.
  const rows = await prisma.$queryRaw<Array<{
    id: string; code: string; name: string; uom: string; category: string;
    reorderLevel: string; onHand: string; standardRate: string;
  }>>`
    SELECT
      i.id, i.code, i.name,
      u.code AS uom,
      c.name AS category,
      i."reorderLevel"::text AS "reorderLevel",
      COALESCE(sb.qty, 0)::text AS "onHand",
      i."standardRate"::text AS "standardRate"
    FROM "m_items" i
    JOIN "m_uoms" u ON u.id = i."uomId"
    JOIN "m_item_categories" c ON c.id = i."categoryId"
    LEFT JOIN (
      SELECT "itemId", SUM(quantity) AS qty FROM "stock_balances" GROUP BY "itemId"
    ) sb ON sb."itemId" = i.id
    WHERE i.status = 'ACTIVE'
      AND i."reorderLevel" > 0
      AND COALESCE(sb.qty, 0) <= i."reorderLevel"
    ORDER BY (COALESCE(sb.qty, 0) / NULLIF(i."reorderLevel", 0)) ASC
  `;

  const items: Row[] = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, uom: r.uom, category: r.category,
    reorderLevel: Number(r.reorderLevel), onHand: Number(r.onHand), standardRate: Number(r.standardRate),
  }));

  const showValue = ctx.has(PERM.material.stock.viewValuation);

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div>
          <p className="text-sm text-navy-900">{r.name}</p>
          <p className="text-xs text-muted-500"><code>{r.code}</code> · {r.category}</p>
        </div>
      ),
    },
    {
      key: "onHand",
      header: "On hand",
      align: "right",
      className: "num",
      render: (r) => <span className="font-semibold text-bad-600">{qty(r.onHand, 3)} {r.uom}</span>,
    },
    {
      key: "level",
      header: "Reorder level",
      align: "right",
      className: "num",
      render: (r) => `${qty(r.reorderLevel, 3)} ${r.uom}`,
    },
    {
      key: "shortfall",
      header: "Shortfall",
      align: "right",
      className: "num",
      render: (r) => <span className="font-medium text-navy-900">{qty(Math.max(0, r.reorderLevel - r.onHand), 3)}</span>,
    },
    {
      key: "cost",
      header: "Est. cost to replenish",
      align: "right",
      className: "num",
      visible: showValue,
      render: (r) => money(Math.max(0, r.reorderLevel - r.onHand) * r.standardRate),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reorder Alerts"
        description="Items at or below their reorder level, most urgent first — surfaced rather than discovered."
        actions={items.length > 0 ? <Badge tone="bad">{items.length} item(s)</Badge> : <Badge tone="good">All stocked</Badge>}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TriangleAlert className="h-8 w-8" />}
            title="Nothing needs reordering"
            description="Every item with a reorder level is currently above it."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
