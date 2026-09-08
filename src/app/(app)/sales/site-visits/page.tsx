import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { SiteVisitsScreen } from "./site-visits-screen";

export const metadata = { title: "Site Visits" };

export default async function SiteVisitsPage() {
  const ctx = await requirePermission(PERM.sales.siteVisit.view);

  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { conductedById: ctx.id };

  const [visits, leads, projects] = await Promise.all([
    prisma.siteVisit.findMany({
      where: ownership,
      orderBy: [{ visitedAt: "asc" }, { scheduledAt: "asc" }],
      take: 150,
      include: {
        lead: { select: { id: true, name: true, leadNo: true, phone: true, state: true } },
        conductedBy: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        state: { notIn: ["BOOKED", "LOST"] },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, leadNo: true, projectId: true },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Site Visits"
        description="Scheduled visits, outcomes and customer feedback — the step that moves a lead to negotiation."
      />

      <SiteVisitsScreen
        visits={visits.map((v) => ({
          id: v.id,
          leadId: v.lead.id,
          leadName: v.lead.name,
          leadNo: v.lead.leadNo,
          leadPhone: v.lead.phone,
          leadState: v.lead.state,
          scheduledAt: v.scheduledAt.toISOString(),
          visitedAt: v.visitedAt?.toISOString() ?? null,
          feedback: v.feedback,
          rating: v.rating,
          conductedByName: v.conductedBy.name,
        }))}
        leads={leads}
        nowMs={new Date().getTime()}
        projects={projects}
        can={{
          schedule: ctx.has(PERM.sales.siteVisit.schedule),
          complete: ctx.has(PERM.sales.siteVisit.complete),
          cancel: ctx.has(PERM.sales.siteVisit.cancel),
          viewContact: ctx.has(PERM.sales.lead.viewContact),
        }}
      />
    </div>
  );
}
