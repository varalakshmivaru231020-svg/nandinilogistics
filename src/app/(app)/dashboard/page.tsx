import Link from "next/link";
import { CheckSquare, PhoneCall, Users, UserPlus } from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle, StatLabel, StatValue } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { taskSummaryByTeamLeader } from "@/lib/tasks/service";

export const metadata = { title: "Dashboard" };

/**
 * One dashboard, with the SOW's tiles drawn for whoever is looking: leads by
 * stage and follow-ups for a tele-caller, the team and its tasks for a Team
 * Leader, everything for Admin. Each tile is computed only when the viewer
 * holds the permission of the screen it summarises, so a number is never shown
 * to somebody who could not open what it counts.
 *
 * Payouts, onboarding approvals and advance requests join this page as their
 * modules land.
 */
export default async function DashboardPage() {
  const ctx = await requireAuth();
  const now = new Date();
  const nowMs = now.getTime();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const canLeads = ctx.has(PERM.sales.lead.view);
  const canPeople = ctx.has(PERM.hr.employee.view);
  const canTasks = ctx.has(PERM.task.task.view);
  const mine = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };

  /* ------------------------------ Leads by stage --------------------------- */

  const stages = canLeads
    ? await prisma.leadStage.findMany({
        where: { status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, kind: true, _count: { select: { leads: { where: mine } } } },
      })
    : [];
  const leadTotal = stages.reduce((s, st) => s + st._count.leads, 0);
  const stageMax = Math.max(1, ...stages.map((s) => s._count.leads));

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);

  const [dueToday, overdue] = canLeads
    ? await Promise.all([
        prisma.lead.count({
          where: { ...mine, stage: { kind: { not: "LOST" } }, nextActionAt: { gte: startOfToday, lt: endOfToday } },
        }),
        prisma.lead.count({
          where: { ...mine, stage: { kind: { not: "LOST" } }, nextActionAt: { lt: startOfToday } },
        }),
      ])
    : [0, 0];

  /* ---------------------------------- People ------------------------------- */

  const [activePeople, leftPeople] = canPeople
    ? await Promise.all([
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.employee.count({ where: { status: "INACTIVE" } }),
      ])
    : [0, 0];

  /* ---------------------------------- Tasks -------------------------------- */

  const taskScope = ctx.has(PERM.task.task.viewAll)
    ? {}
    : { OR: [{ assignees: { some: { userId: ctx.id } } }, { createdById: ctx.id }] };
  const [openTasks, overdueTasks, doneTasks] = canTasks
    ? await Promise.all([
        prisma.task.count({ where: { ...taskScope, status: { not: "DONE" } } }),
        prisma.task.count({ where: { ...taskScope, status: { not: "DONE" }, dueAt: { lt: now } } }),
        prisma.task.count({ where: { ...taskScope, status: "DONE" } }),
      ])
    : [0, 0, 0];

  const kpis: Array<{ label: string; value: string; sub: string; href: string; icon: React.ReactNode; tone: string }> = [];
  if (canLeads) {
    kpis.push({
      label: "Leads in pipeline",
      value: String(leadTotal),
      sub: `${stages.filter((s) => s.kind === "NEW").reduce((n, s) => n + s._count.leads, 0)} new`,
      href: "/sales/leads",
      icon: <UserPlus className="h-4 w-4" />,
      tone: "bg-brand-100 text-brand-500",
    });
    kpis.push({
      label: "Follow-ups today",
      value: String(dueToday),
      sub: overdue > 0 ? `${overdue} overdue` : "nothing overdue",
      href: "/sales/follow-ups",
      icon: <PhoneCall className="h-4 w-4" />,
      tone: overdue > 0 ? "bg-bad-050 text-bad-700" : "bg-good-050 text-good-700",
    });
  }
  if (canPeople) {
    kpis.push({
      label: "Active riders & staff",
      value: String(activePeople),
      sub: `${leftPeople} left`,
      href: "/hr",
      icon: <Users className="h-4 w-4" />,
      tone: "bg-plum-050 text-plum-600",
    });
  }
  if (canTasks) {
    kpis.push({
      label: "Open tasks",
      value: String(openTasks),
      sub: overdueTasks > 0 ? `${overdueTasks} overdue · ${doneTasks} done` : `${doneTasks} done`,
      href: "/tasks",
      icon: <CheckSquare className="h-4 w-4" />,
      tone: overdueTasks > 0 ? "bg-warn-050 text-warn-700" : "bg-brand-100 text-brand-500",
    });
  }

  // The SOW's Admin dashboard card: open, overdue and completed tasks per Team Leader.
  const canTaskReport = ctx.has(PERM.task.report.view);
  const perTeamLeader = canTaskReport ? await taskSummaryByTeamLeader(prisma, nowMs) : [];

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium text-muted-600">
          {greeting}, {ctx.name.split(" ")[0]} ·{" "}
          {now.toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      {kpis.length > 0 ? (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className="block">
              <div className="flex h-full flex-col gap-[9px] rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px] transition-colors hover:border-brand-500">
                <div className="flex items-center justify-between gap-2">
                  <StatLabel>{k.label}</StatLabel>
                  <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]", k.tone)}>
                    {k.icon}
                  </span>
                </div>
                <StatValue>{k.value}</StatValue>
                <span className="text-[11.5px] font-medium text-muted-400">{k.sub}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-500">Nothing to show yet — your role has no screens with a summary.</p>
          </CardBody>
        </Card>
      )}

      {canTaskReport && perTeamLeader.length > 0 && (
        <Card className="mt-3.5">
          <CardHeader>
            <div>
              <CardTitle>Tasks per Team Leader</CardTitle>
              <CardSubtitle>Open, overdue and done</CardSubtitle>
            </div>
            <Link href="/tasks">
              <Button size="sm" variant="secondary">Open tasks →</Button>
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400">
                  <th className="px-4 py-2">Team Leader</th>
                  <th className="num px-4 py-2 text-right">Open</th>
                  <th className="num px-4 py-2 text-right">In progress</th>
                  <th className="num px-4 py-2 text-right">Overdue</th>
                  <th className="num px-4 py-2 text-right">Done</th>
                </tr>
              </thead>
              <tbody>
                {perTeamLeader.map((t) => (
                  <tr key={t.userId} className="border-t border-line-200">
                    <td className="px-4 py-2 font-semibold text-navy-900">{t.name}</td>
                    <td className="num px-4 py-2 text-right">{t.open}</td>
                    <td className="num px-4 py-2 text-right">{t.inProgress}</td>
                    <td className={cn("num px-4 py-2 text-right", t.overdue > 0 && "font-bold text-bad-700")}>{t.overdue}</td>
                    <td className="num px-4 py-2 text-right">{t.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {canLeads && stages.length > 0 && (
        <Card className="mt-3.5">
          <CardHeader>
            <div>
              <CardTitle>Leads by stage</CardTitle>
              <CardSubtitle>{ctx.has(PERM.sales.lead.viewAll) ? "Every lead in the pipeline" : "Leads assigned to you"}</CardSubtitle>
            </div>
            <Link href="/sales/leads">
              <Button size="sm" variant="secondary">Open leads →</Button>
            </Link>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {stages.map((s) => (
                <li key={s.id} className="grid items-center gap-3 [grid-template-columns:160px_1fr_48px]">
                  <span className="truncate text-[12.5px] font-semibold text-navy-900">{s.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-field">
                    <span
                      className={cn("block h-full rounded-full", s.kind === "LOST" ? "bg-bad-600" : s.kind === "ONBOARDING" ? "bg-good-600" : "bg-brand-500")}
                      style={{ width: `${Math.round((s._count.leads / stageMax) * 100)}%` }}
                    />
                  </span>
                  <span className="num text-right text-[12.5px] font-bold text-navy-950">{s._count.leads}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
