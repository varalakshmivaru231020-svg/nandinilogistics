import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { leadListWhere } from "@/lib/sales/lead-list";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { LeadsScreen } from "./leads-screen";

export const metadata = { title: "Lead Management · Sales CRM" };

const STAGES = ["NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST"] as const;

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

  const [leads, stageCounts, sources, lostReasons, projects, owners, unitTypes] = await Promise.all([
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
    ctx.has(PERM.sales.lead.assign)
      ? prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const counts = Object.fromEntries(stageCounts.map((s) => [s.state, s._count]));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Lead Management · Sales CRM"
        description={
          ctx.has(PERM.sales.lead.viewAll)
            ? "The whole pipeline, worked against live availability."
            : "Your pipeline. Nothing promised twice, nothing forgotten once."
        }
      />

      {/* Pipeline summary */}
      <Card className="mb-4">
        <CardBody className="flex flex-wrap gap-x-8 gap-y-3 py-3">
          {STAGES.map((s) => (
            <div key={s}>
              <p className="text-[11px] uppercase tracking-wide text-muted-400">{s.replace(/_/g, " ")}</p>
              <p className="num text-lg font-semibold text-navy-950">{counts[s] ?? 0}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <LeadsScreen
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
        owners={owners}
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
