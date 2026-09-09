import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { LeadsScreen } from "./leads-screen";

export const metadata = { title: "Leads" };

const STAGES = ["NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST"] as const;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; source?: string; fu?: string; view?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.lead.view);
  const { q = "", state = "all", source = "all", fu = "all", view = "board" } = await searchParams;
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86_400_000);

  // Without viewAll a sales executive sees only their own pipeline.
  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };

  const where = {
    ...ownership,
    ...(q.trim()
      ? {
          OR: [
            { name: { contains: q.trim(), mode: "insensitive" as const } },
            { phone: { contains: q.trim() } },
            { leadNo: { contains: q.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(state !== "all" ? { state: state as never } : {}),
    ...(source !== "all" ? { sourceId: source } : {}),
    // Follow-up filter, as in the design: overdue / today / this week / none set.
    ...(fu === "overdue" ? { nextActionAt: { lt: now } } : {}),
    ...(fu === "today"
      ? {
          nextActionAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
        }
      : {}),
    ...(fu === "week" ? { nextActionAt: { gte: now, lte: soon } } : {}),
    ...(fu === "none" ? { nextActionAt: null } : {}),
  };

  const [leads, stageCounts, sources, lostReasons, projects, owners] = await Promise.all([
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
  ]);

  const counts = Object.fromEntries(stageCounts.map((s) => [s.state, s._count]));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Leads"
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
        }}
      />
    </div>
  );
}
