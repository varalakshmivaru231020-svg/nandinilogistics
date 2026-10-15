import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { priceListScreenRow } from "@/lib/screens/rows/unit";
import { priceListEmpty } from "@/lib/units/price-list-display";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";

export const dynamic = "force-dynamic";

/**
 * Exports the price list history — every version for the projects mapped to
 * the caller, with its effective window and rates — as the Price Lists screen
 * shows it.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.unit.priceList.view, PERM.unit.priceList.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const lists = await prisma.priceList.findMany({
    where: projectScopeFilter(ctx),
    orderBy: [{ project: { code: "asc" } }, { version: "desc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: {
      project: { select: { code: true, name: true } },
      items: { take: 1, orderBy: { id: "asc" } },
    },
  });
  const { rows: rowsIn, note } = capRows(lists);

  /* The screen, for the app: the version row the web draws, with its rates. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rowsIn.length);
    screen = {
      rows: rowsIn.slice(from, to).map((l) =>
        priceListScreenRow({
          id: l.id,
          name: l.name,
          version: l.version,
          isActive: l.isActive,
          projectCode: l.project.code,
          effectiveFrom: l.effectiveFrom,
          effectiveTo: l.effectiveTo,
          baseRate: l.items[0] ? Number(l.items[0].baseRate) : 0,
          floorRise: l.items[0] ? Number(l.items[0].floorRise) : 0,
          plcAmount: l.items[0] ? Number(l.items[0].plcAmount) : 0,
        }, { activate: ctx.has(PERM.unit.priceList.activate) }),
      ),
      empty: priceListEmpty(),
    };
  }

  return exportResponse({
    ...gate,
    screen,
    title: "Price Lists",
    entity: "PriceList",
    filters: ctx.canAccessAllProjects ? "All projects" : "Projects mapped to you",
    result: {
      columns: [
        { key: "projectCode", header: "Project" },
        { key: "projectName", header: "Project name" },
        { key: "version", header: "Version", align: "right", format: "number" },
        { key: "name", header: "Name" },
        { key: "effectiveFrom", header: "Effective from", format: "date" },
        { key: "effectiveTo", header: "Effective to", format: "date" },
        { key: "state", header: "State" },
        { key: "baseRate", header: "Base rate (per sq.ft)", align: "right", format: "money" },
        { key: "floorRise", header: "Floor rise", align: "right", format: "money" },
        { key: "plcAmount", header: "PLC amount", align: "right", format: "money" },
      ],
      rows: rowsIn.map((l) => ({
        id: l.id,
        projectCode: l.project.code,
        projectName: l.project.name,
        version: l.version,
        name: l.name,
        effectiveFrom: l.effectiveFrom,
        effectiveTo: l.effectiveTo,
        state: l.isActive ? "Active" : "Superseded",
        baseRate: l.items[0] ? Number(l.items[0].baseRate) : null,
        floorRise: l.items[0] ? Number(l.items[0].floorRise) : null,
        plcAmount: l.items[0] ? Number(l.items[0].plcAmount) : null,
      })),
      summary: [{ label: "Versions", value: note }],
      emptyMessage: "No price lists yet.",
    },
  });
}
