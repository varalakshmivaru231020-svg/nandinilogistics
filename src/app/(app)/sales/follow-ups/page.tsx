import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { ModuleStats } from "@/components/list/module-stats";
import { followUpFigures } from "@/lib/metrics/figures";
import { FollowUpsScreen } from "./follow-ups-screen";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; type?: string; month?: string }>;
}) {
  const ctx = await requirePermission(PERM.sales.followUp.view);
  const { view = "grid", q = "", type = "all", month } = await searchParams;

  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  const search = q.trim();

  // Every lead carrying a scheduled next action, with its most recent contact.
  const leads = await prisma.lead.findMany({
    where: {
      ...ownership,
      nextActionAt: { not: null },
      state: { notIn: ["BOOKED", "LOST"] },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { requirement: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { nextActionAt: "asc" },
    take: 300,
    include: {
      source: { select: { name: true } },
      project: { select: { name: true } },
      owner: { select: { name: true } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { channel: true, notes: true, outcome: true },
      },
      siteVisits: {
        where: { visitedAt: null },
        orderBy: { scheduledAt: "asc" },
        take: 1,
        select: { scheduledAt: true },
      },
    },
  });

  const now = new Date();

  /*
   * The band reads the whole pipeline the viewer can see, so it does not move
   * when somebody searches. Open follow-ups are the leads carrying a next
   * action; logged ones are the contacts already recorded against them.
   */
  const [openRows, loggedCount] = await Promise.all([
    prisma.lead.findMany({
      where: { ...ownership, nextActionAt: { not: null }, state: { notIn: ["BOOKED", "LOST"] } },
      select: { nextActionAt: true },
    }),
    prisma.leadFollowUp.count({ where: { lead: ownership } }),
  ]);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const rows = leads
    .map((l) => {
      // A lead with a pending site visit is shown as a visit, not a call.
      const isVisit = l.siteVisits.length > 0;
      const channel = isVisit ? "SITE_VISIT" : (l.followUps[0]?.channel ?? "CALL");
      return {
        id: l.id,
        leadNo: l.leadNo,
        name: l.name,
        phone: l.phone,
        // The design reads the lead's interest as "Skyline · 2 BHK".
        requirement: [l.project?.name, l.requirement].filter(Boolean).join(" · ") || null,
        source: l.source.name,
        ownerName: l.owner?.name ?? null,
        state: l.state,
        channel,
        remarks: l.followUps[0]?.notes ?? l.requirement ?? "No remarks recorded",
        outcome: l.followUps[0]?.outcome ?? null,
        dueAt: (l.nextActionAt as Date).toISOString(),
      };
    })
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
