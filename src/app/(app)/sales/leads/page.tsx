import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { leadListWhere, readLeadListParams } from "@/lib/sales/lead-list";
import { ModuleStats } from "@/components/list/module-stats";
import { leadFigures } from "@/lib/metrics/figures";
import { LeadsScreen } from "./leads-screen";

export const metadata = { title: "Leads · CRM" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.sales.lead.view);
  const raw = await searchParams;
  const params = readLeadListParams(raw);
  const view = raw.view === "list" ? "list" : "board";
  const now = new Date();

  // Without viewAll a tele-caller sees only their own pipeline.
  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  // Shared with the export, so a download holds exactly what this screen shows.
  const where = leadListWhere(ownership, params, now);

  const canAssign = ctx.has(PERM.sales.lead.assign);
  const [leads, stages, statRows, companies, lostReasons, formFields, teleCallerIds] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        stage: { select: { id: true, name: true, kind: true } },
        owner: { select: { id: true, name: true } },
        lostReason: { select: { name: true } },
        companies: { select: { company: { select: { id: true, name: true } } } },
        _count: { select: { followUps: true } },
      },
    }),
    prisma.leadStage.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, sortOrder: true },
    }),
    // The band reads the whole pipeline the viewer can see, not the filtered page.
    prisma.lead.findMany({ where: ownership, select: { createdAt: true, stage: { select: { kind: true } } } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lostReason.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // The Capture-lead form is whatever Masters → Lead Settings says it is.
    prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } }),
    // Who may be handed a lead — the same pool round-robin draws from.
    usersHolding(prisma, PERM.sales.lead.receiveAssignment),
  ]);

  const teleCallers = ctx.has(PERM.sales.lead.viewAll) || canAssign
    ? await prisma.user.findMany({
        where: { id: { in: teleCallerIds }, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const totalLeads = statRows.length;
  const openLeads = statRows.filter((l) => l.stage.kind !== "LOST").length;

  return (
    <div>
      <ModuleStats
        figures={leadFigures(
          statRows.map((l) => ({ stageKind: l.stage.kind, createdAt: l.createdAt })),
          now.getTime(),
        )}
      />
      <LeadsScreen
        totalLeads={totalLeads}
        openLeads={openLeads}
        stages={stages}
        companies={companies}
        teleCallers={teleCallers}
        lostReasons={lostReasons}
        formFields={formFields.map((f) => ({
          id: f.id, fieldKey: f.fieldKey, label: f.label,
          type: f.type, required: f.required, isSystem: f.isSystem,
        }))}
        filters={params}
        view={view}
        nowMs={now.getTime()}
        leads={leads.map((l) => ({
          id: l.id,
          leadNo: l.leadNo,
          name: l.name,
          phone: l.phone,
          email: l.email,
          location: l.location,
          stageId: l.stage.id,
          stageName: l.stage.name,
          stageKind: l.stage.kind,
          ownerId: l.owner?.id ?? null,
          ownerName: l.owner?.name ?? null,
          companies: l.companies.map((c) => c.company.name),
          requirement: l.requirement,
          nextActionAt: l.nextActionAt ? l.nextActionAt.toISOString() : null,
          lostReason: l.lostReason?.name ?? null,
          followUpCount: l._count.followUps,
          isDuplicate: Boolean(l.duplicateOfId),
          approval: l.approval,
        }))}
        can={{
          create: ctx.has(PERM.sales.lead.create),
          changeStage: ctx.has(PERM.sales.lead.changeStage),
          markLost: ctx.has(PERM.sales.lead.markLost),
          assign: canAssign,
          viewAll: ctx.has(PERM.sales.lead.viewAll),
          viewContact: ctx.has(PERM.sales.lead.viewContact),
          followUp: ctx.has(PERM.sales.followUp.create),
          export: ctx.has(PERM.sales.lead.export),
        }}
      />
    </div>
  );
}
