import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import { describeUnitFilters, readUnitListParams, unitExportColumns, unitListWhere } from "@/lib/units/unit-list";

export const dynamic = "force-dynamic";

/**
 * Exports the unit list — every unit matching the screen's filters, within the
 * projects mapped to the caller. Headers match the unit import where the value
 * can go back in.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.unit.unit.view, PERM.unit.unit.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const p = readUnitListParams(params);
  const where = unitListWhere(ctx, p);
  const showAreas = ctx.has(PERM.unit.unit.viewPrice);

  const units = await prisma.unit.findMany({
    where,
    orderBy: [{ project: { code: "asc" } }, { unitNumber: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: {
      project: { select: { code: true } },
      block: { select: { name: true } },
      unitType: { select: { name: true } },
    },
  });
  const { rows: rowsIn, note } = capRows(units);

  const [project, block, type] = await Promise.all([
    where.projectId && typeof where.projectId === "string"
      ? prisma.project.findUnique({ where: { id: where.projectId }, select: { code: true } })
      : null,
    p.block !== "all" && p.block ? prisma.block.findUnique({ where: { id: p.block }, select: { name: true } }) : null,
    p.type !== "all" && p.type ? prisma.unitType.findUnique({ where: { id: p.type }, select: { name: true } }) : null,
  ]);

  return exportResponse({
    ...gate,
    title: "Units",
    entity: "Unit",
    filters: describeUnitFilters(p, { project: project?.code, block: block?.name, type: type?.name }),
    projectId: typeof where.projectId === "string" ? where.projectId : null,
    result: {
      columns: unitExportColumns(showAreas),
      rows: rowsIn.map((u) => ({
        id: u.id,
        project: u.project.code,
        block: u.block?.name ?? "",
        unitNumber: u.unitNumber,
        unitType: u.unitType?.name ?? "",
        floorNumber: u.floorNumber,
        carpetArea: Number(u.carpetArea),
        builtUpArea: Number(u.builtUpArea),
        superBuiltUpArea: Number(u.superBuiltUpArea),
        facing: u.facing ?? "",
        plcTag: u.plcTag ?? "",
        parkingSlots: u.parkingSlots,
        status: u.status,
      })),
      summary: [{ label: "Units", value: note }],
      emptyMessage: "No units match these filters.",
    },
  });
}
