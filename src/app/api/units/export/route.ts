import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { unitFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { projectScopeFilter, type AuthContext } from "@/lib/rbac/context";
import { unitDecisions } from "@/lib/records/unit";
import { screenBoard } from "@/lib/screens/rows/board";
import { expireStaleHolds } from "@/lib/sales/service";
import { UNIT_EMPTY, unitScreenRow } from "@/lib/screens/rows/unit";
import { PERM } from "@/lib/permissions/codes";
import { describeUnitFilters, readUnitListParams, unitExportColumns, unitListWhere } from "@/lib/units/unit-list";

export const dynamic = "force-dynamic";

/**
 * Exports the unit list — every unit matching the screen's filters, within the
 * projects mapped to the caller. Headers match the unit import where the value
 * can go back in.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.unit.unit.view, PERM.unit.unit.export, {
    // The app's screen for this key is the web's board, which has its own
    // permission; the file is still the unit master's.
    asList: [PERM.unit.board.view],
  });
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

  /* The screen, for the app: the flat as the table draws it, and the band the
   * web opens with over every unit in scope. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rowsIn.length);
    const window = rowsIn.slice(from, to);
    const [statRows, locks] = await Promise.all([
      prisma.unit.findMany({
        where: unitListWhere(ctx, { ...p, q: "", status: "all", block: "all", type: "all" }),
        select: { status: true, superBuiltUpArea: true },
      }),
      // What the row's Delete depends on — a flat with a hold or a booking on
      // it cannot go, and the record decides that the same way.
      prisma.unit.findMany({
        where: { id: { in: window.map((u) => u.id) } },
        select: { id: true, _count: { select: { holds: true, bookings: true } } },
      }),
    ]);
    const counts = new Map(locks.map((u) => [u.id, u._count]));
    const canUnit = {
      update: ctx.has(PERM.unit.unit.update),
      remove: ctx.has(PERM.unit.unit.delete),
      changeStatus: ctx.has(PERM.unit.unit.changeStatus),
    };
    /*
     * "Available Flats" is a **board**, not a list: `/units/board` is what the
     * drawer's entry opens, and the phone's screen for this key is the same
     * board. So the rows travel as well — the same flats are behind both — and
     * the board travels with them.
     */
    const board = await boardFor(ctx);

    screen = {
      ...(board ? { board } : {}),
      rows: window.map((u) =>
        unitScreenRow(
          {
            id: u.id,
            unitNumber: u.unitNumber,
            projectCode: u.project.code,
            block: u.block?.name ?? null,
            unitType: u.unitType?.name ?? null,
            floorNumber: u.floorNumber,
            carpetArea: Number(u.carpetArea),
            superBuiltUpArea: Number(u.superBuiltUpArea),
            facing: u.facing,
            plcTag: u.plcTag,
            parkingSlots: u.parkingSlots,
            status: u.status,
          },
          showAreas,
          unitDecisions(
            {
              id: u.id,
              status: u.status,
              holds: counts.get(u.id)?.holds ?? 0,
              bookings: counts.get(u.id)?.bookings ?? 0,
            },
            canUnit,
          ),
        ),
      ),
      band: bandOf(unitFigures(statRows)),
      empty: UNIT_EMPTY,
    };
  }

  const [project, block, type] = await Promise.all([
    where.projectId && typeof where.projectId === "string"
      ? prisma.project.findUnique({ where: { id: where.projectId }, select: { code: true } })
      : null,
    p.block !== "all" && p.block ? prisma.block.findUnique({ where: { id: p.block }, select: { name: true } }) : null,
    p.type !== "all" && p.type ? prisma.unitType.findUnique({ where: { id: p.type }, select: { name: true } }) : null,
  ]);

  return exportResponse({
    ...gate,
    screen,
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

/**
 * The board the web paints at `/units/board`, for the project this caller is
 * working in — their chosen workspace, or the first project they can reach, as
 * the web picks it.
 *
 * Holds release themselves, so the sweep the board page runs before reading
 * runs here too; otherwise the phone would show a hold the web has already let
 * go.
 */
async function boardFor(ctx: AuthContext) {
  if (!ctx.has(PERM.unit.board.view)) return undefined;

  await prisma.$transaction((tx) => expireStaleHolds(tx));

  const projects = await prisma.project.findMany({
    where: projectScopeFilter(ctx, "id"),
    orderBy: { name: "asc" },
    select: { id: true, name: true, projectType: { select: { name: true } } },
  });
  const project = projects[0];
  if (!project) return undefined;

  const [blocks, priceList, customers] = await Promise.all([
    prisma.block.findMany({
      where: { projectId: project.id },
      orderBy: { code: "asc" },
      include: {
        units: {
          orderBy: [{ floorNumber: "desc" }, { unitNumber: "asc" }],
          include: {
            unitType: { select: { name: true } },
            holds: {
              where: { isActive: true },
              take: 1,
              include: {
                lead: { select: { name: true } },
                customer: { select: { name: true } },
              },
            },
            bookings: {
              where: { status: { notIn: ["CANCELLED"] } },
              orderBy: { bookingDate: "desc" },
              take: 1,
              select: { id: true, status: true, customer: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.priceList.findFirst({
      where: { projectId: project.id, status: "ACTIVE" },
      orderBy: { effectiveFrom: "desc" },
      select: { version: true, effectiveFrom: true },
    }),
    ctx.has(PERM.unit.hold.create) || ctx.has(PERM.sales.booking.create)
      ? prisma.customer.findMany({
          orderBy: { name: "asc" },
          take: 200,
          select: { id: true, name: true, phone: true },
        })
      : Promise.resolve([]),
  ]);

  return screenBoard(ctx, {
    project: { id: project.id, name: project.name },
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    projectType: project.projectType?.name ?? null,
    priceList,
    customers,
    blocks: blocks.map((b) => ({
      id: b.id,
      name: b.name,
      units: b.units.map((u) => ({
        id: u.id,
        unitNumber: u.unitNumber,
        floorNumber: u.floorNumber,
        status: u.status,
        superBuiltUpArea: u.superBuiltUpArea,
        unitType: u.unitType,
        hold: u.holds[0]
          ? {
              id: u.holds[0].id,
              customerName: u.holds[0].customer?.name ?? null,
              leadName: u.holds[0].lead?.name ?? null,
            }
          : null,
        booking: u.bookings[0]
          ? {
              id: u.bookings[0].id,
              status: u.bookings[0].status,
              customerName: u.bookings[0].customer.name,
            }
          : null,
      })),
    })),
  });
}
