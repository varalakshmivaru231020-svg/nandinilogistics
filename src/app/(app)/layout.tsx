import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PermissionProvider } from "@/components/rbac/permission-provider";
import { AppShell } from "@/components/shell/app-shell";
import { projectScopeFilter } from "@/lib/rbac/context";
import { escalateOverdueFollowUps } from "@/lib/sales/lead-service";

/**
 * Every screen below this layout is authenticated. The permission set is
 * resolved once here and handed to the client tree so the menu and the
 * in-page controls agree with the server guards.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();

  // Sidebar counters — each is computed only when the user can see that screen.
  const scope = projectScopeFilter(ctx);
  const badges: Record<string, number> = {};

  // Overdue follow-ups escalate on their own. There is no scheduler, so the
  // sweep runs whenever a signed-in page renders — the same approach expired
  // unit holds use. Each lapse is claimed before anyone is notified, so
  // concurrent renders cannot notify twice, and a failure here must never take
  // the whole shell down with it.
  try {
    await escalateOverdueFollowUps(prisma, new Date());
  } catch (error) {
    console.error("Follow-up escalation sweep failed", error);
  }

  // The name of the project being worked in, for the topbar chip.
  const workspaceName = ctx.workspaceProjectId
    ? (await prisma.project.findUnique({
        where: { id: ctx.workspaceProjectId },
        select: { name: true },
      }))?.name ?? null
    : null;

  // The approvals badge counts what this person can actually decide, so it
  // never nags about something they cannot act on.
  if (ctx.has(PERM.approvals.queue.view)) {
    const waiting: Array<Promise<number>> = [];
    if (ctx.has(PERM.material.indent.approvePm)) {
      waiting.push(prisma.indent.count({ where: { ...scope, status: "SUBMITTED" } }));
    }
    if (ctx.has(PERM.material.indent.approveAdmin)) {
      waiting.push(prisma.indent.count({ where: { ...scope, status: "PM_APPROVED" } }));
    }
    if (ctx.has(PERM.material.purchaseOrder.approvePm)) {
      waiting.push(prisma.purchaseOrder.count({
        where: { ...scope, status: { in: ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL"] } },
      }));
    }
    if (ctx.has(PERM.material.purchaseOrder.approveAdmin)) {
      waiting.push(prisma.purchaseOrder.count({ where: { ...scope, status: "PENDING_ADMIN_APPROVAL" } }));
    }
    // Task Management's decisions count too, or the badge contradicts the queue.
    if (ctx.has(PERM.task.task.view)) {
      const seesAll = ctx.has(PERM.task.task.viewAll);
      if (ctx.has(PERM.task.task.close)) {
        waiting.push(prisma.task.count({
          where: {
            status: "COMPLETED", kind: "STANDALONE",
            ...(seesAll ? {} : { createdById: ctx.id }),
          },
        }));
      }
      if (ctx.has(PERM.task.task.approveExtension)) {
        waiting.push(prisma.taskExtension.count({
          where: { status: "REQUESTED", ...(seesAll ? {} : { task: { createdById: ctx.id } }) },
        }));
      }
      // A level is only yours when it is the one waiting, which the queue works
      // out; counting the tasks you sit on is close enough for a badge and far
      // cheaper than replaying every round.
      waiting.push(prisma.task.count({
        where: {
          status: { in: ["UNDER_REVIEW", "UNDER_APPROVAL"] },
          ...(seesAll ? {} : { levels: { some: { userId: ctx.id } } }),
        },
      }));
    }

    const counts = await Promise.all(waiting);
    const total = counts.reduce((n, c) => n + c, 0);
    if (total > 0) badges.approvals = total;
  }

  badges.notifications = await prisma.notification.count({
    where: { userId: ctx.id, readAt: null },
  });

  if (ctx.has(PERM.material.indent.view)) {
    const waitingOnMe: string[] = [];
    if (ctx.has(PERM.material.indent.approvePm)) waitingOnMe.push("SUBMITTED");
    if (ctx.has(PERM.material.indent.approveAdmin)) waitingOnMe.push("PM_APPROVED");
    if (waitingOnMe.length) {
      badges.indentPending = await prisma.indent.count({
        where: { ...scope, status: { in: waitingOnMe as never } },
      });
    }
  }

  if (ctx.has(PERM.task.task.view)) {
    badges.tasks = await prisma.task.count({ where: { status: { notIn: ["CLOSED"] } } });
  }

  if (ctx.has(PERM.sales.followUp.view)) {
    badges.followUpDue = await prisma.lead.count({
      where: {
        nextActionAt: { lte: new Date() },
        state: { notIn: ["BOOKED", "LOST"] },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
    });
  }

  if (ctx.has(PERM.material.reorder.view)) {
    // Items whose total on-hand quantity has fallen to or below the reorder level.
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "m_items" i
      LEFT JOIN (
        SELECT "itemId", SUM(quantity) AS qty FROM "stock_balances" GROUP BY "itemId"
      ) sb ON sb."itemId" = i.id
      WHERE i.status = 'ACTIVE'
        AND i."reorderLevel" > 0
        AND COALESCE(sb.qty, 0) <= i."reorderLevel"
    `;
    badges.reorder = Number(rows[0]?.count ?? 0);
  }

  return (
    <PermissionProvider
      principal={{
        id: ctx.id,
        name: ctx.name,
        email: ctx.email,
        employeeCode: ctx.employeeCode,
        isSuperAdmin: ctx.isSuperAdmin,
        roles: ctx.roles.map((r) => ({ code: r.code, name: r.name })),
        permissions: [...ctx.permissions],
        canAccessAllProjects: ctx.canAccessAllProjects,
      }}
    >
      <AppShell badges={badges} workspaceName={workspaceName}>
        {children}
      </AppShell>
    </PermissionProvider>
  );
}
