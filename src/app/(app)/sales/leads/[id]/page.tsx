import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { maskPhone } from "@/lib/utils";
import { LeadDetail } from "./lead-detail";

export const metadata = { title: "Lead" };

/** The pipeline as the design draws it in the stepper — LOST sits outside it. */
const STEPPER = [
  { key: "NEW", name: "New" },
  { key: "CONTACTED", name: "Contacted" },
  { key: "SITE_VISIT_SCHEDULED", name: "Site visit" },
  { key: "VISIT_DONE", name: "Visit done" },
  { key: "NEGOTIATION", name: "Negotiation" },
  { key: "BOOKED", name: "Booked" },
] as const;

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tower?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.lead.view);
  // Read the clock once, during fetching — never in a component body.
  const now = new Date();
  const { id } = await params;
  const { tab = "timeline", tower = "all" } = await searchParams;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      source: { select: { name: true } },
      project: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      lostReason: { select: { name: true } },
      followUps: {
        orderBy: { completedAt: "desc" },
        include: { user: { select: { name: true } } },
      },
      notes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      documents: { orderBy: { createdAt: "desc" } },
      holds: {
        where: { isActive: true },
        include: { unit: { select: { id: true, unitNumber: true, unitType: { select: { name: true } } } } },
      },
      bookings: {
        include: { unit: { select: { unitNumber: true, unitType: { select: { name: true } } } } },
      },
    },
  });
  if (!lead) notFound();

  // Row-level scoping: without viewAll a sales user only opens their own leads.
  if (!ctx.has(PERM.sales.lead.viewAll) && lead.ownerId !== ctx.id) notFound();

  const canContact = ctx.has(PERM.sales.lead.viewContact);

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
      const c = a.changes as { state?: { from?: string; to?: string } } | null;
      return Boolean(c?.state?.from && c?.state?.to);
    })
    .map((a) => {
      const c = a.changes as { state: { from: string; to: string } };
      return {
        id: a.id,
        from: c.state.from.replace(/_/g, " "),
        to: c.state.to.replace(/_/g, " "),
        by: a.user?.name ?? "System",
        at: a.createdAt.toISOString(),
      };
    });

  // Available units to block, for the Flats tab. Scoped to the lead's project.
  const availableUnits = lead.projectId
    ? await prisma.unit.findMany({
        where: { projectId: lead.projectId, status: "AVAILABLE" },
        orderBy: [{ floorNumber: "asc" }, { unitNumber: "asc" }],
        take: 60,
        select: {
          id: true,
          unitNumber: true,
          floorNumber: true,
          unitType: { select: { name: true } },
          block: { select: { id: true, name: true } },
        },
      })
    : [];

  const towers = [...new Map(
    availableUnits.filter((u) => u.block).map((u) => [u.block!.id, u.block!.name]),
  )].map(([id, name]) => ({ id, name }));

  return (
    <LeadDetail
      lead={{
        id: lead.id,
        leadNo: lead.leadNo,
        name: lead.name,
        phone: canContact ? lead.phone : maskPhone(lead.phone),
        email: canContact ? lead.email : null,
        sourceName: lead.source.name,
        projectName: lead.project?.name ?? null,
        ownerName: lead.owner?.name ?? null,
        firstResponseMins: lead.firstResponseMins,
        state: lead.state,
        requirement: lead.requirement,
        budgetMin: lead.budgetMin ? Number(lead.budgetMin) : null,
        budgetMax: lead.budgetMax ? Number(lead.budgetMax) : null,
        nextActionAt: lead.nextActionAt?.toISOString() ?? null,
        lostReason: lead.lostReason?.name ?? null,
        lostNotes: lead.lostNotes,
        createdAt: lead.createdAt.toISOString(),
      }}
      stepper={STEPPER.map((s, i) => ({
        key: s.key,
        name: s.name,
        hasLine: i > 0,
        done: STEPPER.findIndex((x) => x.key === lead.state) > i,
        current: lead.state === s.key,
      }))}
      timeline={audit.map((a) => ({
        id: a.id,
        text: a.summary,
        by: a.user?.name ?? "System",
        at: a.createdAt.toISOString(),
        action: a.action,
      }))}
      followUps={lead.followUps.map((f) => ({
        id: f.id,
        channel: f.channel,
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
      blocked={[
        ...lead.holds.map((h) => ({
          id: h.id,
          kind: "hold" as const,
          unitNumber: h.unit.unitNumber,
          plan: h.unit.unitType?.name ?? "—",
          expiresAt: h.expiresAt.toISOString(),
        })),
        ...lead.bookings.map((b) => ({
          id: b.id,
          kind: "booking" as const,
          unitNumber: b.unit.unitNumber,
          plan: b.unit.unitType?.name ?? "—",
          expiresAt: null,
        })),
      ]}
      available={availableUnits
        .filter((u) => tower === "all" || u.block?.id === tower)
        .map((u) => ({
          id: u.id,
          unitNumber: u.unitNumber,
          plan: u.unitType?.name ?? "—",
          blockName: u.block?.name ?? null,
        }))}
      towers={towers}
      tower={tower}
      tab={tab}
      projectName={lead.project?.name ?? null}
      can={{
        tabTimeline: ctx.has(PERM.sales.lead.tabTimeline),
        tabFollowUps: ctx.has(PERM.sales.lead.tabFollowUps),
        tabNotes: ctx.has(PERM.sales.lead.tabNotes),
        tabStageHistory: ctx.has(PERM.sales.lead.tabStageHistory),
        tabFiles: ctx.has(PERM.sales.lead.tabFiles),
        tabFlats: ctx.has(PERM.sales.lead.tabFlats),
        edit: ctx.has(PERM.sales.lead.update),
        sendMail: ctx.has(PERM.sales.lead.sendMail),
        logFollowUp: ctx.has(PERM.sales.followUp.create),
        note: ctx.has(PERM.sales.lead.note),
        uploadFile: ctx.has(PERM.sales.lead.uploadFile),
        block: ctx.has(PERM.unit.hold.create),
        release: ctx.has(PERM.unit.hold.release),
      }}
      nowMs={now.getTime()}
    />
  );
}
