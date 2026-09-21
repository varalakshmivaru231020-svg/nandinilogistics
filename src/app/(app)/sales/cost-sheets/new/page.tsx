import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { CostSheetBuilder } from "./cost-sheet-builder";
import { projectScopeFilter } from "@/lib/rbac/context";

export const metadata = { title: "Generate Cost Sheet" };

export default async function NewCostSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; lead?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.costSheet.create);
  const { unit: unitId, lead: leadId } = await searchParams;

  const scope = projectScopeFilter(ctx);

  const [units, leads, heads, priceLists] = await Promise.all([
    prisma.unit.findMany({
      where: { ...scope, status: { in: ["AVAILABLE", "HELD"] } },
      orderBy: { unitNumber: "asc" },
      take: 500,
      select: {
        id: true, unitNumber: true, floorNumber: true, status: true,
        superBuiltUpArea: true, parkingSlots: true, plcTag: true,
        project: { select: { id: true, code: true, name: true } },
        unitType: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        state: { notIn: ["BOOKED", "LOST"] },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, leadNo: true },
    }),
    prisma.chargeHead.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
      include: { taxRate: { select: { percentage: true } } },
    }),
    prisma.priceList.findMany({
      where: { isActive: true, status: "ACTIVE" },
      include: { items: true, project: { select: { id: true } } },
    }),
  ]);

  const ratesByProject = new Map(
    priceLists.map((p) => [
      p.project.id,
      {
        baseRate: Number(p.items[0]?.baseRate ?? 0),
        floorRise: Number(p.items[0]?.floorRise ?? 0),
        plcAmount: Number(p.items[0]?.plcAmount ?? 0),
        name: p.name,
      },
    ]),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Generate a cost sheet"
        description="Every line comes from a charge head in the master and a rate from the active price list."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/sales/cost-sheets" className="hover:text-brand-600">Cost Sheets</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      {units.length === 0 ? (
        <Alert tone="warn" title="No units are available to quote">
          Every unit in your projects is already booked, or you are not mapped to a project with
          inventory.
        </Alert>
      ) : (
        <CostSheetBuilder
          preselectedUnitId={unitId}
          preselectedLeadId={leadId}
          units={units.map((u) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            floorNumber: u.floorNumber,
            status: u.status,
            superBuiltUpArea: Number(u.superBuiltUpArea),
            parkingSlots: u.parkingSlots,
            plcTag: u.plcTag,
            projectId: u.project.id,
            projectCode: u.project.code,
            unitType: u.unitType?.name ?? null,
          }))}
          leads={leads}
          chargeHeads={heads.map((h) => ({
            id: h.id,
            code: h.code,
            name: h.name,
            calcType: h.calcType,
            defaultValue: Number(h.defaultValue),
            taxPct: h.taxRate ? Number(h.taxRate.percentage) : 0,
            sortOrder: h.sortOrder,
            isMandatory: h.isMandatory,
          }))}
          rates={Object.fromEntries(ratesByProject)}
          canDiscount={ctx.has(PERM.sales.costSheet.create)}
        />
      )}
    </div>
  );
}
