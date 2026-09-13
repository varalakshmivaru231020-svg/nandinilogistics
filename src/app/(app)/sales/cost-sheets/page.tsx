import Link from "next/link";
import { Calculator } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { costSheetListWhere, readCostSheetListParams } from "@/lib/sales/cost-sheet-list";
import { toSearchParams } from "@/lib/sales/list-common";
import { costSheetLookups } from "./lookups";
import { NewCostSheetDrawer } from "./new-cost-sheet-drawer";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money } from "@/lib/utils";

export const metadata = { title: "Cost Sheets" };

type Row = {
  id: string; costSheetNo: string; createdAt: Date; validUntil: Date | null;
  totalAmount: unknown; discountAmount: unknown; discountApprovedAt: Date | null;
  unit: { unitNumber: string; project: { code: string } };
  lead: { name: string } | null;
  _count: { bookings: number };
};

export default async function CostSheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.sales.costSheet.view);
  const raw = await searchParams;
  const params = readCostSheetListParams(raw);
  const filtered = Boolean(params.q || params.status || params.project);
  const now = new Date();

  const lookups = ctx.has(PERM.sales.costSheet.create) ? await costSheetLookups(ctx) : null;

  const [sheets, projects] = await Promise.all([
    prisma.costSheet.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: costSheetListWhere(ctx, params, now),
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        unit: { select: { unitNumber: true, project: { select: { code: true } } } },
        lead: { select: { name: true } },
        _count: { select: { bookings: true } },
      },
    }),
    prisma.project.findMany({
      where: projectScopeFilter(ctx, "id"),
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const awaitingDiscount = sheets.filter(
    (s) => Number(s.discountAmount) > 0 && !s.discountApprovedAt,
  ).length;

  const columns: Column<Row>[] = [
    {
      key: "sheet",
      header: "Cost sheet",
      render: (s) => (
        <div>
          <Link href={`/sales/cost-sheets/${s.id}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
            {s.costSheetNo}
          </Link>
          <p className="text-xs text-muted-500">
            {s.unit.project.code} · unit {s.unit.unitNumber}
          </p>
        </div>
      ),
    },
    { key: "lead", header: "For", render: (s) => <span className="text-sm">{s.lead?.name ?? "—"}</span> },
    { key: "created", header: "Generated", render: (s) => <span className="text-xs text-muted-500">{formatDate(s.createdAt)}</span> },
    {
      key: "valid",
      header: "Valid until",
      render: (s) => {
        if (!s.validUntil) return <span className="text-xs text-muted-400">—</span>;
        const expired = new Date(s.validUntil) < now;
        return (
          <span className={expired ? "text-xs text-bad-600" : "text-xs text-muted-500"}>
            {formatDate(s.validUntil)}{expired && " · expired"}
          </span>
        );
      },
    },
    {
      key: "discount",
      header: "Discount",
      align: "right",
      className: "num",
      render: (s) => {
        const d = Number(s.discountAmount);
        if (d <= 0) return <span className="text-muted-400">—</span>;
        return (
          <span className={s.discountApprovedAt ? "text-good-700" : "text-warn-700"}>
            {money(d)}
            <span className="ml-1 text-[10px]">{s.discountApprovedAt ? "approved" : "pending"}</span>
          </span>
        );
      },
    },
    {
      key: "total", header: "Total", align: "right", className: "num",
      render: (s) => <span className="font-medium text-navy-950">{money(s.totalAmount)}</span>,
    },
    {
      key: "status", header: "", align: "center",
      render: (s) => (s._count.bookings > 0 ? <Badge tone="good">Booked</Badge> : <Badge tone="slate">Quoted</Badge>),
    },
  ];

  const query = toSearchParams(raw);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Cost Sheets"
        description="Base price, floor rise, PLC, parking, amenities, GST and registration — generated from the active price list, not typed."
        actions={
          <div className="flex items-center gap-2">
            {awaitingDiscount > 0 && <Badge tone="warn">{awaitingDiscount} discount(s) pending approval</Badge>}
            {ctx.has(PERM.sales.costSheet.create) && (
              <NewCostSheetDrawer
                units={lookups!.units}
                leads={lookups!.leads}
                chargeHeads={lookups!.chargeHeads}
                rates={lookups!.rates}
                canDiscount={ctx.has(PERM.sales.costSheet.create)}
              />
            )}
          </div>
        }
      />

      <ListToolbar
        searchPlaceholder="Search cost sheet no, lead, unit, project…"
        filters={[
          {
            name: "status",
            label: "Status",
            allLabel: "All statuses",
            options: [
              { value: "quoted", label: "Quoted" },
              { value: "booked", label: "Booked" },
              { value: "discountPending", label: "Discount pending" },
              { value: "expired", label: "Expired, not booked" },
            ],
          },
          {
            name: "project",
            label: "Projects",
            options: projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          },
        ]}
        count={sheets.length}
      >
        {ctx.has(PERM.sales.costSheet.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/sales/cost-sheets/export", format, query)}
            disabled={sheets.length === 0}
          />
        )}
      </ListToolbar>

      {sheets.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={<Calculator className="h-8 w-8" />}
              title="No cost sheets match"
              description="Try a different search, status or project."
            />
          ) : (
            <EmptyState
              icon={<Calculator className="h-8 w-8" />}
              title="No cost sheets yet"
              description="Pick an available unit and the cost sheet is generated from the price list active on that date."
            />
          )}
        </Card>
      ) : (
        <DataTable columns={columns} rows={sheets} rowKey={(s) => s.id} dense />
      )}
    </div>
  );
}
