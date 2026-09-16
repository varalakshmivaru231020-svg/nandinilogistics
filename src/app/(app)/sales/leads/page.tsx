import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { leadListWhere } from "@/lib/sales/lead-list";
import { LeadsScreen } from "./leads-screen";

export const metadata = { title: "Lead Management · Sales CRM" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; source?: string; fu?: string; view?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.lead.view);
  const { q = "", state = "all", source = "all", fu = "all", view = "board" } = await searchParams;
  const now = new Date();

  // Without viewAll a sales executive sees only their own pipeline.
  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  // Shared with the export, so a download holds exactly what this screen shows.
  const where = leadListWhere(ownership, { q, state, source, fu }, now);

  const [leads, stageCounts, sources, lostReasons, projects, unitTypes] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        source: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        project: { select: { code: true } },
        lostReason: { select: { name: true } },
        _count: { select: { followUps: true, siteVisits: true } },
      },
    }),
    prisma.lead.groupBy({ by: ["state"], where: ownership, _count: true }),
    prisma.leadSource.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lostReason.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // The design's header counts: how many leads there are in all, and how many
  // are still open — everything but booked and lost.
  const totalLeads = stageCounts.reduce((n, s) => n + s._count, 0);
  const openLeads = stageCounts
    .filter((s) => s.state !== "BOOKED" && s.state !== "LOST")
    .reduce((n, s) => n + s._count, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <LeadsScreen
        totalLeads={totalLeads}
        openLeads={openLeads}
        unitTypes={unitTypes}
        query={q}
        stateFilter={state}
        sourceFilter={source}
        followUpFilter={fu}
        view={view === "list" ? "list" : "board"}
        nowMs={now.getTime()}
        leads={leads.map((l) => ({
          id: l.id,
          leadNo: l.leadNo,
          name: l.name,
          phone: l.phone,
          email: l.email,
          state: l.state,
          source: l.source.name,
          ownerId: l.owner?.id ?? null,
          ownerName: l.owner?.name ?? null,
          projectCode: l.project?.code ?? null,
          requirement: l.requirement,
          budgetMin: l.budgetMin === null ? null : Number(l.budgetMin),
          budgetMax: l.budgetMax === null ? null : Number(l.budgetMax),
          nextActionAt: l.nextActionAt ? l.nextActionAt.toISOString() : null,
          sourceId: l.sourceId,
          lostReason: l.lostReason?.name ?? null,
          followUpCount: l._count.followUps,
          visitCount: l._count.siteVisits,
          isDuplicate: Boolean(l.duplicateOfId),
        }))}
        sources={sources}
        lostReasons={lostReasons}
        projects={projects}
        can={{
          create: ctx.has(PERM.sales.lead.create),
          changeStage: ctx.has(PERM.sales.lead.changeStage),
          markLost: ctx.has(PERM.sales.lead.markLost),
          assign: ctx.has(PERM.sales.lead.assign),
          viewContact: ctx.has(PERM.sales.lead.viewContact),
          followUp: ctx.has(PERM.sales.followUp.create),
          export: ctx.has(PERM.sales.lead.export),
          import: ctx.has(PERM.sales.lead.import),
        }}
      />
    </div>
  );
}
