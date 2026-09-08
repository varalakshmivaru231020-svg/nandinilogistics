import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { qty } from "@/lib/utils";
import { UnitFilters } from "./unit-filters";

export const metadata = { title: "Units" };

const PAGE_SIZE = 50;

const STATUS_TONE: Record<string, "green" | "amber" | "sky" | "violet" | "slate" | "red"> = {
  AVAILABLE: "green", HELD: "amber", BOOKED: "sky",
  AGREEMENT: "violet", REGISTERED: "slate", BLOCKED: "red",
};

type UnitRow = {
  id: string;
  unitNumber: string;
  floorNumber: number;
  status: string;
  carpetArea: unknown;
  superBuiltUpArea: unknown;
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
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission(PERM.unit.unit.view);
  const { q = "", status = "all", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };
  const where = {
    ...scope,
    ...(q.trim() ? { unitNumber: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    ...(status !== "all" ? { status: status as never } : {}),
  };

  const [units, total] = await Promise.all([
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
  ]);

  const showPrice = ctx.has(PERM.unit.unit.viewPrice);

  const columns: Column<UnitRow>[] = [
    {
      key: "unit",
      header: "Unit",
      render: (u) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{u.unitNumber}</p>
          <p className="text-xs text-slate-500">{u.project.code} · {u.block?.name ?? "—"}</p>
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
    { key: "facing", header: "Facing", render: (u) => u.facing ?? <span className="text-slate-400">—</span> },
    {
      key: "plc", header: "PLC", align: "center",
      render: (u) => (u.plcTag ? <Badge tone="amber">{u.plcTag}</Badge> : <span className="text-slate-400">—</span>),
    },
    { key: "parking", header: "Parking", align: "right", className: "num", render: (u) => u.parkingSlots },
    {
      key: "status", header: "Status", align: "center",
      render: (u) => <Badge tone={STATUS_TONE[u.status] ?? "slate"}>{u.status}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Units"
        description="Live unit inventory across the projects mapped to you."
        actions={<Badge tone="slate">{total.toLocaleString("en-IN")} units</Badge>}
      />

      <div className="space-y-3">
        <UnitFilters q={q} status={status} />

        {units.length === 0 ? (
          <Card><CardBody><p className="py-8 text-center text-sm text-slate-500">No units match these filters.</p></CardBody></Card>
        ) : (
          <>
            <DataTable columns={columns} rows={units} rowKey={(u) => u.id} dense />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              buildHref={(p) => {
                const sp = new URLSearchParams();
                if (q) sp.set("q", q);
                if (status !== "all") sp.set("status", status);
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
