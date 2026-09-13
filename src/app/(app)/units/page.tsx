import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { qty } from "@/lib/utils";
import { readUnitListParams, unitListWhere } from "@/lib/units/unit-list";
import { UnitFilters } from "./unit-filters";

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
  const projectScope = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };
  const selectedProject = params.project !== "all" && params.project ? params.project : null;

  const [units, total, projects, blocks, unitTypes] = await Promise.all([
    prisma.unit.findMany({
      where,
      orderBy: [{ unitNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        block: { select: { name: true } },
        unitType: { select: { name: true } },
        project: { select: { name: true, code: true } },
      },
    }),
    prisma.unit.count({ where }),
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
  ]);

  const showPrice = ctx.has(PERM.unit.unit.viewPrice);

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
  ];

  const rows: UnitRow[] = units.map((u) => ({
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
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Units"
        description="Live unit inventory across the projects mapped to you."
        actions={<Badge tone="slate">{total.toLocaleString("en-IN")} units</Badge>}
      />

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
    </div>
  );
}
