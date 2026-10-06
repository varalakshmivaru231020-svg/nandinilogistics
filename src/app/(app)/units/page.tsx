import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { ModuleStats } from "@/components/list/module-stats";
import { unitFigures } from "@/lib/metrics/figures";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { qty } from "@/lib/utils";
import { readUnitListParams, unitListWhere } from "@/lib/units/unit-list";
import { checkUnitDeletable, unitEditLocks } from "@/lib/units/unit-rules";
import { UnitFilters } from "./unit-filters";
import { NewUnitButton, UnitManager, UnitRowActions, type ManagedUnit, type UnitFormLookups } from "./unit-manager";
import { projectScopeFilter } from "@/lib/rbac/context";

export const metadata = { title: "Units" };

const PAGE_SIZE = 50;

const STATUS_TONE: Record<string, "good" | "warn" | "brand" | "navy" | "slate" | "bad"> = {
  AVAILABLE: "good", HELD: "warn", BOOKED: "brand",
  AGREEMENT: "navy", REGISTERED: "slate", BLOCKED: "bad",
};

type UnitRow = {
  id: string;
  unitNumber: string;
  floorNumber: number;
  status: string;
  carpetArea: number;
  superBuiltUpArea: number;
  facing: string | null;
  plcTag: string | null;
  parkingSlots: number;
  block: { name: string } | null;
  unitType: { name: string } | null;
  project: { name: string; code: string };
  manage: ManagedUnit;
};

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.unit.unit.view);
  const raw = await searchParams;
  const params = readUnitListParams(raw);
  const pageParam = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  // The same where clause the export uses, so a download matches the screen.
  const where = unitListWhere(ctx, params);
  const projectScope = projectScopeFilter(ctx, "id");
  const selectedProject = params.project !== "all" && params.project ? params.project : null;

  const showPrice = ctx.has(PERM.unit.unit.viewPrice);
  // Creating needs carpet area, which only those who may see it can enter.
  const can = {
    create: ctx.has(PERM.unit.unit.create) && showPrice,
    update: ctx.has(PERM.unit.unit.update),
    changeStatus: ctx.has(PERM.unit.unit.changeStatus),
    delete: ctx.has(PERM.unit.unit.delete),
  };
  const usesForm = can.create || can.update;
  const rowControls = can.update || can.changeStatus || can.delete;

  const [units, total, statRows, projects, blocks, unitTypes, formBlocks, formUnitTypes] = await Promise.all([
    prisma.unit.findMany({
      where,
      orderBy: [{ unitNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        block: { select: { name: true } },
        unitType: { select: { name: true } },
        project: { select: { name: true, code: true } },
        _count: { select: { holds: true, bookings: true, costSheets: true, priceItems: true } },
      },
    }),
    prisma.unit.count({ where }),
    // The band reads every flat in scope, not the filtered page.
    prisma.unit.findMany({
      where: { project: projectScope },
      select: { status: true, superBuiltUpArea: true },
    }),
    prisma.project.findMany({ where: projectScope, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.block.findMany({
      where: {
        project: projectScope,
        ...(selectedProject ? { projectId: selectedProject } : {}),
      },
      orderBy: [{ project: { code: "asc" } }, { code: "asc" }],
      select: { id: true, name: true, project: { select: { code: true } } },
    }),
    prisma.unitType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // The unit form's choices: active blocks of every project in scope, and active unit types.
    usesForm
      ? prisma.block.findMany({
          where: { status: "ACTIVE", project: projectScope },
          orderBy: { name: "asc" },
          select: { id: true, projectId: true, name: true, totalFloors: true },
        })
      : Promise.resolve([]),
    usesForm
      ? prisma.unitType.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const formLookups: UnitFormLookups = { projects, blocks: formBlocks, unitTypes: formUnitTypes };

  const columns: Column<UnitRow>[] = [
    {
      key: "unit",
      header: "Unit",
      render: (u) => (
        <div>
          <p className="text-sm font-medium text-navy-950">{u.unitNumber}</p>
          <p className="text-xs text-muted-500">{u.project.code} · {u.block?.name ?? "—"}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (u) => <span className="text-sm">{u.unitType?.name ?? "—"}</span> },
    { key: "floor", header: "Floor", align: "right", className: "num", render: (u) => u.floorNumber },
    {
      key: "carpet", header: "Carpet (sq.ft)", align: "right", className: "num",
      visible: showPrice,
      render: (u) => qty(u.carpetArea, 0),
    },
    {
      key: "sba", header: "Super built-up", align: "right", className: "num",
      render: (u) => qty(u.superBuiltUpArea, 0),
    },
    { key: "facing", header: "Facing", render: (u) => u.facing ?? <span className="text-muted-400">—</span> },
    {
      key: "plc", header: "PLC", align: "center",
      render: (u) => (u.plcTag ? <Badge tone="warn">{u.plcTag}</Badge> : <span className="text-muted-400">—</span>),
    },
    { key: "parking", header: "Parking", align: "right", className: "num", render: (u) => u.parkingSlots },
    {
      key: "status", header: "Status", align: "center",
      render: (u) => <Badge tone={STATUS_TONE[u.status] ?? "slate"}>{u.status}</Badge>,
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      visible: rowControls,
      render: (u) => <UnitRowActions unit={u.manage} />,
    },
  ];

  const rows: UnitRow[] = units.map((u) => {
    const locks = unitEditLocks({
      status: u.status, holds: u._count.holds, bookings: u._count.bookings, costSheets: u._count.costSheets,
      priceItems: u._count.priceItems,
    });
    return {
      id: u.id,
      unitNumber: u.unitNumber,
      floorNumber: u.floorNumber,
      status: u.status,
      carpetArea: Number(u.carpetArea),
      superBuiltUpArea: Number(u.superBuiltUpArea),
      facing: u.facing,
      plcTag: u.plcTag,
      parkingSlots: u.parkingSlots,
      block: u.block,
      unitType: u.unitType,
      project: u.project,
      manage: {
        id: u.id,
        projectId: u.projectId,
        blockId: u.blockId,
        blockName: u.block?.name ?? null,
        unitTypeId: u.unitTypeId,
        unitTypeName: u.unitType?.name ?? null,
        unitNumber: u.unitNumber,
        floorNumber: u.floorNumber,
        // Carpet and built-up area never reach a browser that may not show them.
        ...(showPrice ? { carpetArea: Number(u.carpetArea), builtUpArea: Number(u.builtUpArea) } : {}),
        superBuiltUpArea: Number(u.superBuiltUpArea),
        facing: u.facing,
        plcTag: u.plcTag,
        parkingSlots: u.parkingSlots,
        status: u.status,
        updatedAt: u.updatedAt.toISOString(),
        locked: [...locks.locked],
        lockReason: locks.identityReason,
        deleteBlocker: checkUnitDeletable({ unitNumber: u.unitNumber, status: u.status, ...u._count }),
      },
    };
  });

  return (
    <div>
      <UnitManager lookups={formLookups} canSeeAreas={showPrice}>
        <PageHeader
          title="Units"
          description="Live unit inventory across the projects mapped to you."
          actions={
            <div className="flex items-center gap-2">
              <Badge tone="slate">{total.toLocaleString("en-IN")} units</Badge>
              {can.create && <NewUnitButton />}
            </div>
          }
        />

        <ModuleStats figures={unitFigures(statRows)} />

        <div className="space-y-3">
          <UnitFilters
            projects={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            blocks={blocks.map((b) => ({ value: b.id, label: selectedProject ? b.name : `${b.project.code} · ${b.name}` }))}
            unitTypes={unitTypes.map((t) => ({ value: t.id, label: t.name }))}
            total={total}
            can={{ export: ctx.has(PERM.unit.unit.export), import: ctx.has(PERM.unit.unit.import) }}
          />

          {rows.length === 0 ? (
            <Card><CardBody><p className="py-8 text-center text-sm text-muted-500">No units match these filters.</p></CardBody></Card>
          ) : (
            <>
              <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} dense />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                buildHref={(p) => {
                  const sp = new URLSearchParams();
                  if (params.q) sp.set("q", params.q);
                  for (const key of ["status", "project", "block", "type"] as const) {
                    if (params[key] && params[key] !== "all") sp.set(key, params[key]);
                  }
                  sp.set("page", String(p));
                  return `?${sp.toString()}`;
                }}
              />
            </>
          )}
        </div>
      </UnitManager>
    </div>
  );
}
