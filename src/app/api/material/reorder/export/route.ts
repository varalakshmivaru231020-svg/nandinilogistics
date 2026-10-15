import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { reorderEmpty, reorderScreenRow } from "@/lib/screens/rows/material-rest";
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

  /* The screen, for the app: the alert row, most urgent first as the table
   * orders them. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((r) => reorderScreenRow(r, showValuation)),
      empty: reorderEmpty(Boolean(params.q || params.category), rows.length > 0),
    };
  }

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
    screen,
  });
}
