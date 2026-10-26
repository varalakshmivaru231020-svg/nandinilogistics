import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { maskPhone } from "@/lib/utils";
import { dateInputValue, editRefusal } from "@/lib/sales/lead-edit";
import { LeadDetail } from "./lead-detail";
import { StartOnboardingButton } from "./start-onboarding-button";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.lead.view);
  // Read the clock once, during fetching — never in a component body.
  const now = new Date();
  const { id } = await params;
  const { tab = "timeline" } = await searchParams;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      stage: true,
      owner: { select: { id: true, name: true } },
      lostReason: { select: { name: true } },
      companies: { select: { company: { select: { id: true, name: true } } } },
      followUps: {
        orderBy: { completedAt: "desc" },
        include: { user: { select: { name: true } }, stage: { select: { name: true } } },
      },
      notes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      documents: { orderBy: { createdAt: "desc" } },
      rider: { select: { id: true, employeeCode: true } },
    },
  });
  if (!lead) notFound();

  // Row-level scoping: without viewAll a tele-caller only opens their own leads.
  if (!ctx.has(PERM.sales.lead.viewAll) && lead.ownerId !== ctx.id) notFound();

  const canContact = ctx.has(PERM.sales.lead.viewContact);

  // Edit: the permission, and the same ownership rule the action enforces.
  const canEdit = ctx.has(PERM.sales.lead.update) && editRefusal(
    { id: ctx.id, canViewAll: ctx.has(PERM.sales.lead.viewAll), canViewContact: canContact },
    lead,
  ) === null;

  const [stages, companies, lostReasons, teleCallerIds] = await Promise.all([
    // The pipeline, in Masters' order. The lead's own stage is kept even if
    // since disabled, so the rail still shows where it stands.
    prisma.leadStage.findMany({
      where: { OR: [{ status: "ACTIVE" }, { id: lead.stageId }] },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, sortOrder: true },
    }),
    canEdit
      ? prisma.company.findMany({
          where: { OR: [{ status: "ACTIVE" }, { id: { in: lead.companies.map((c) => c.company.id) } }] },
          select: { id: true, name: true }, orderBy: { name: "asc" },
        })
      : [],
    ctx.has(PERM.sales.lead.markLost)
      ? prisma.lostReason.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    ctx.has(PERM.sales.lead.assign) ? usersHolding(prisma, PERM.sales.lead.receiveAssignment) : [],
  ]);

  // Who a lead can be handed to — whoever holds the duty to receive one.
  const owners = teleCallerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: teleCallerIds }, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Whatever Lead Settings added to the form, answered, and in the order the
  // form asks it.
  const answers = (lead.customFields ?? {}) as Record<string, string>;
  const customFieldRows = Object.keys(answers).length
    ? (await prisma.leadFormField.findMany({
        where: { id: { in: Object.keys(answers) } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true },
      })).map((f) => ({ label: f.label, value: answers[f.id] }))
    : [];

  // Timeline and stage history both come from the audit trail — the record of
  // what happened is the same record the audit viewer reads.
  const audit = await prisma.auditLog.findMany({
    where: { entity: "Lead", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: { select: { name: true } } },
  });

  const stageHistory = audit
    .filter((a) => {
      const c = a.changes as { stage?: { from?: string; to?: string } } | null;
      return Boolean(c?.stage?.from && c?.stage?.to);
    })
    .map((a) => {
      const c = a.changes as { stage: { from: string; to: string } };
      return { id: a.id, from: c.stage.from, to: c.stage.to, by: a.user?.name ?? "System", at: a.createdAt.toISOString() };
    });

  const current = stages.findIndex((s) => s.id === lead.stageId);

  return (
    <LeadDetail
      owners={owners}
      lead={{
        id: lead.id,
        leadNo: lead.leadNo,
        name: lead.name,
        phone: canContact ? lead.phone : maskPhone(lead.phone),
        canCall: canContact,
        email: canContact ? lead.email : null,
        location: lead.location,
        companies: lead.companies.map((c) => c.company.name),
        ownerName: lead.owner?.name ?? null,
        ownerId: lead.owner?.id ?? null,
        firstResponseMins: lead.firstResponseMins,
        stageName: lead.stage.name,
        stageKind: lead.stage.kind,
        requirement: lead.requirement,
        nextActionAt: lead.nextActionAt?.toISOString() ?? null,
        customFields: customFieldRows,
        lostReason: lead.lostReason?.name ?? null,
        lostNotes: lead.lostNotes,
        createdAt: lead.createdAt.toISOString(),
      }}
      lostReasons={lostReasons}
      stepper={stages.map((s, i) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        hasLine: i > 0,
        done: lead.stage.kind !== "LOST" && current > i,
        current: current === i,
      }))}
      timeline={[
        ...audit.map((a) => ({
          id: a.id,
          text: a.summary,
          by: a.user?.name ?? "System",
          at: a.createdAt.toISOString(),
          action: a.action,
        })),
        // The design opens every timeline with the moment the lead arrived.
        ...(audit.some((a) => a.action === "CREATE")
          ? []
          : [{
              id: "created",
              text: "Created in New",
              by: lead.owner?.name ?? "System",
              at: lead.createdAt.toISOString(),
              action: "CREATE",
            }]),
      ]}
      followUps={lead.followUps.map((f) => ({
        id: f.id,
        channel: f.channel,
        stage: f.stage?.name ?? null,
        notes: f.notes,
        outcome: f.outcome,
        by: f.user.name,
        at: f.completedAt.toISOString(),
        nextActionAt: f.nextActionAt?.toISOString() ?? null,
      }))}
      notes={lead.notes.map((n) => ({
        id: n.id,
        body: n.body,
        by: n.user.name,
        at: n.createdAt.toISOString(),
      }))}
      stageHistory={stageHistory}
      files={lead.documents.map((d) => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        fileSize: d.fileSize,
        at: d.createdAt.toISOString(),
      }))}
      tab={tab}
      edit={canEdit ? {
        lead: {
          id: lead.id,
          name: lead.name,
          contact: canContact
            ? { phone: lead.phone, altPhone: lead.altPhone ?? "", email: lead.email ?? "" }
            : null,
          maskedPhone: maskPhone(lead.phone),
          location: lead.location ?? "",
          companyIds: lead.companies.map((c) => c.company.id),
          requirement: lead.requirement ?? "",
          nextActionDay: dateInputValue(lead.nextActionAt),
          updatedAt: lead.updatedAt.toISOString(),
          closed: lead.stage.kind === "LOST",
        },
        companies,
      } : null}
      can={{
        tabTimeline: ctx.has(PERM.sales.lead.tabTimeline),
        tabFollowUps: ctx.has(PERM.sales.lead.tabFollowUps),
        tabNotes: ctx.has(PERM.sales.lead.tabNotes),
        tabStageHistory: ctx.has(PERM.sales.lead.tabStageHistory),
        tabFiles: ctx.has(PERM.sales.lead.tabFiles),
        edit: canEdit,
        changeStage: ctx.has(PERM.sales.lead.changeStage),
        markLost: ctx.has(PERM.sales.lead.markLost),
        logFollowUp: ctx.has(PERM.sales.followUp.create),
        note: ctx.has(PERM.sales.lead.note),
        uploadFile: ctx.has(PERM.sales.lead.uploadFile),
        assign: ctx.has(PERM.sales.lead.assign),
      }}
      nowMs={now.getTime()}
      onboarding={
        // SOW §3.1 stage 4 — the Onboarding stage opens the onboarding form.
        lead.stage.kind === "ONBOARDING" && (lead.rider || ctx.has(PERM.hr.employee.create)) ? (
          <StartOnboardingButton
            leadId={lead.id}
            rider={lead.rider ? { id: lead.rider.id, code: lead.rider.employeeCode } : null}
          />
        ) : null
      }
    />
  );
}
