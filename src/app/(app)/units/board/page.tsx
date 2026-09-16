import Link from "next/link";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { expireStaleHolds } from "@/lib/sales/service";
import { BoardGrid } from "./board-grid";
import { UnitSetup } from "./unit-setup";

export const metadata = { title: "Available Flats · Unit Inventory" };

export default async function AvailabilityBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; setup?: string }>;
}) {
  const ctx = await requirePermission(PERM.unit.board.view);
  const { project: projectParam, setup } = await searchParams;

  // Holds release themselves — sweep before anything is read.
  await prisma.$transaction((tx) => expireStaleHolds(tx));

  const projectWhere = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, projectType: { select: { name: true } } },
  });

  const projectId =
    projectParam && projects.some((p) => p.id === projectParam) ? projectParam : projects[0]?.id;

  if (!projectId) {
    return (
      <div>
        <PageHeader title="Available Flats · Unit Inventory" />
        <Card>
          <EmptyState title="No projects available to you" description="You are not mapped to any project yet." />
        </Card>
      </div>
    );
  }

  const [blocks, priceList, customers] = await Promise.all([
    prisma.block.findMany({
      where: { projectId },
      orderBy: { code: "asc" },
      include: {
        units: {
          orderBy: [{ floorNumber: "desc" }, { unitNumber: "asc" }],
          include: {
            unitType: { select: { code: true, name: true } },
            holds: {
              where: { isActive: true },
              take: 1,
              include: { heldBy: { select: { name: true } }, lead: { select: { name: true } } },
            },
          },
        },
      },
    }),
    // The design prints the live price list under the tower's figures.
    prisma.priceList.findFirst({
      where: { projectId, status: "ACTIVE" },
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

  if (setup && ctx.has(PERM.unit.unit.create)) {
    const unitTypes = await prisma.unitType.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return (
      <UnitSetup
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        unitTypes={unitTypes}
        initialProjectId={projectId}
      />
    );
  }

  return (
    <div>
      {/* The design opens this screen with one button, right-aligned. */}
      {ctx.has(PERM.unit.unit.create) && (
        <div className="mb-3.5 flex justify-end">
          <Link
            href={`/units/board?project=${projectId}&setup=1`}
            className="rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
          >
            + Create units
          </Link>
        </div>
      )}

      <BoardGrid
        projects={projects}
        activeProjectId={projectId}
        priceList={
          priceList
            ? { version: `v${priceList.version}`, effectiveFrom: priceList.effectiveFrom.toISOString() }
            : null
        }
        projectType={projects.find((p) => p.id === projectId)?.projectType?.name ?? null}
        blocks={blocks.map((b) => ({
          id: b.id,
          name: b.name,
          units: b.units.map((u) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            floorNumber: u.floorNumber,
            status: u.status,
            unitTypeCode: u.unitType?.code ?? null,
            unitTypeName: u.unitType?.name ?? null,
            superBuiltUpArea: Number(u.superBuiltUpArea),
            carpetArea: Number(u.carpetArea),
            facing: u.facing,
            plcTag: u.plcTag,
            parkingSlots: u.parkingSlots,
            hold: u.holds[0]
              ? {
                  id: u.holds[0].id,
                  expiresAt: u.holds[0].expiresAt.toISOString(),
                  heldByName: u.holds[0].heldBy.name,
                  leadName: u.holds[0].lead?.name ?? null,
                  extensionCount: u.holds[0].extensionCount,
                }
              : null,
          })),
        }))}
        customers={customers}
        nowMs={new Date().getTime()}
        can={{
          hold: ctx.has(PERM.unit.hold.create),
          extend: ctx.has(PERM.unit.hold.extend),
          release: ctx.has(PERM.unit.hold.release),
          viewPrice: ctx.has(PERM.unit.unit.viewPrice),
          book: ctx.has(PERM.sales.booking.create) && ctx.has(PERM.sales.costSheet.create),
        }}
      />
    </div>
  );
}
