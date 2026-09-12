import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { expireStaleHolds } from "@/lib/sales/service";
import { BoardGrid } from "./board-grid";

export const metadata = { title: "Availability Board" };

export default async function AvailabilityBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const ctx = await requirePermission(PERM.unit.board.view);
  const { project: projectParam } = await searchParams;

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
      <div className="mx-auto max-w-7xl">
        <PageHeader title="Availability Board" />
        <Card>
          <EmptyState title="No projects available to you" description="You are not mapped to any project yet." />
        </Card>
      </div>
    );
  }

  const [blocks, statusCounts, leads] = await Promise.all([
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
    prisma.unit.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    ctx.has(PERM.unit.hold.create)
      ? prisma.lead.findMany({
          where: {
            state: { notIn: ["BOOKED", "LOST"] },
            ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, leadNo: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Availability Board"
        description="The single source of truth on what is actually available to sell, readable at a glance."
      />

      <BoardGrid
        projects={projects}
        activeProjectId={projectId}
        statusCounts={statusCounts.map((s) => ({ status: s.status, count: s._count }))}
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
        leads={leads}
        nowMs={new Date().getTime()}
        can={{
          hold: ctx.has(PERM.unit.hold.create),
          extend: ctx.has(PERM.unit.hold.extend),
          release: ctx.has(PERM.unit.hold.release),
          viewPrice: ctx.has(PERM.unit.unit.viewPrice),
          quote: ctx.has(PERM.sales.costSheet.create),
        }}
      />
    </div>
  );
}
