import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ModuleStats } from "@/components/list/module-stats";
import { followUpFigures } from "@/lib/metrics/figures";
import { OPEN_STAGE_KINDS } from "@/lib/sales/assignment";
import { FollowUpsScreen } from "./follow-ups-screen";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; type?: string; month?: string; due?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.followUp.view);
  const { view = "grid", q = "", type = "all", month, due } = await searchParams;

  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  const search = q.trim();
  const now = new Date();

  // Every open lead carrying a scheduled next action, with its most recent contact.
  const openWhere = {
    ...ownership,
    nextActionAt: { not: null },
    stage: { kind: { in: [...OPEN_STAGE_KINDS] } },
  };
  const leads = await prisma.lead.findMany({
    where: {
      ...openWhere,
      ...(due === "overdue" ? { nextActionAt: { lt: now } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { location: { contains: search, mode: "insensitive" as const } },
              { requirement: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { nextActionAt: "asc" },
    take: 300,
    include: {
      stage: { select: { name: true } },
      owner: { select: { name: true } },
      companies: { select: { company: { select: { name: true } } } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { channel: true, notes: true, outcome: true },
      },
    },
  });

  /*
   * The band reads the whole pipeline the viewer can see, so it does not move
   * when somebody searches. Open follow-ups are the leads carrying a next
   * action; logged ones are the contacts already recorded against them.
   */
  const [openRows, loggedCount] = await Promise.all([
    prisma.lead.findMany({ where: openWhere, select: { nextActionAt: true } }),
    prisma.leadFollowUp.count({ where: { lead: ownership } }),
  ]);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const canContact = ctx.has(PERM.sales.lead.viewContact);

  const rows = leads
    .map((l) => ({
      id: l.id,
      leadNo: l.leadNo,
      name: l.name,
      phone: l.phone,
      canCall: canContact,
      companies: l.companies.map((c) => c.company.name).join(", ") || null,
      location: l.location,
      ownerName: l.owner?.name ?? null,
      stageName: l.stage.name,
      channel: l.followUps[0]?.channel ?? "CALL",
      remarks: l.followUps[0]?.notes ?? l.requirement ?? "No remarks recorded",
      outcome: l.followUps[0]?.outcome ?? null,
      dueAt: (l.nextActionAt as Date).toISOString(),
    }))
    .filter((r) => type === "all" || r.channel === type);

  return (
    <div>
      <ModuleStats
        figures={followUpFigures(
          openRows.flatMap((l) => (l.nextActionAt ? [{ dueAt: l.nextActionAt }] : [])),
          loggedCount,
          now.getTime(),
          endOfToday.getTime(),
        )}
      />
      <FollowUpsScreen
        rows={rows}
        view={view === "list" ? "list" : view === "calendar" ? "calendar" : "grid"}
        query={q}
        typeFilter={type}
        month={month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`}
        nowMs={now.getTime()}
        canLog={ctx.has(PERM.sales.followUp.create)}
      />
    </div>
  );
}
