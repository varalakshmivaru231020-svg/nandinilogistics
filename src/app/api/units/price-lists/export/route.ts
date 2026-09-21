import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
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

  return exportResponse({
    ...gate,
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
