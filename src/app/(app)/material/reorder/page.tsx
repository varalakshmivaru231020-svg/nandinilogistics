import { TriangleAlert } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { filterReorderRows, readReorderListParams, toSearchParams } from "@/lib/material/list-filters";
import { categoryOptions, loadReorderRows, type ReorderRow } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { money, qty } from "@/lib/utils";

export const metadata = { title: "Reorder Alerts" };

export default async function ReorderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.reorder.view);
  const raw = await searchParams;
  const params = readReorderListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.category);

  // Alerts before you run out — total on-hand across every store vs the level.
  const [all, categories] = await Promise.all([loadReorderRows(), categoryOptions()]);
  // Shared with the export, so a download holds exactly what this screen shows.
  const items = filterReorderRows(all, params);

  const showValue = ctx.has(PERM.material.stock.viewValuation);

  const columns: Column<ReorderRow>[] = [
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
        actions={all.length > 0 ? <Badge tone="bad">{all.length} item(s)</Badge> : <Badge tone="good">All stocked</Badge>}
      />

      {all.length > 0 && (
        <ListToolbar
          searchPlaceholder="Search item code or name…"
          filters={[{ name: "category", label: "Categories", options: categories }]}
          count={items.length}
        >
          {ctx.has(PERM.material.stock.export) && (
            <ExportMenu
              href={(format) => exportHref("/api/material/reorder/export", format, query)}
              disabled={items.length === 0}
            />
          )}
        </ListToolbar>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TriangleAlert className="h-8 w-8" />}
            title={filtered && all.length > 0 ? "No reorder alerts match these filters" : "Nothing needs reordering"}
            description="Every item with a reorder level is currently above it."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
