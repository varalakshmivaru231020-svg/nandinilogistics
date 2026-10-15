import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, filterReorderRows, readReorderListParams, reorderColumns, reorderRow, searchWords,
} from "@/lib/material/list-filters";
import { categoryLabel, loadReorderRows } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/**
 * The reorder alerts matching the screen's filters. The estimated replenishment
 * cost is left out for anyone without stock valuation, as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.reorder.view, PERM.material.stock.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readReorderListParams(gate.params);
  const showValuation = ctx.has(PERM.material.stock.viewValuation);

  const { rows, note } = capRows(filterReorderRows(await loadReorderRows(), params));

  const filters = describeParts(
    [searchWords(params.q), await categoryLabel(params.category)],
    "Every item at or below its reorder level",
  );

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Reorder Alerts",
    entity: "Item",
    filters: filters + (showValuation ? "" : " · Without valuation"),
    result: {
      columns: reorderColumns(showValuation),
      rows: rows.map((r) => reorderRow(r, showValuation)),
      summary: [{ label: "Items", value: note }],
      emptyMessage: "Nothing needs reordering.",
    },
  });
}
