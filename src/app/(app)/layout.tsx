import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PermissionProvider } from "@/components/rbac/permission-provider";
import { AppShell } from "@/components/shell/app-shell";
import { escalateOverdueFollowUps } from "@/lib/sales/lead-service";
import { inboxCount } from "@/lib/approvals/inbox";
import { loadCheckIn } from "@/lib/hr/check-in";

/**
 * Every screen below this layout is authenticated. The permission set is
 * resolved once here and handed to the client tree so the menu and the
 * in-page controls agree with the server guards.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();

  // Sidebar counters — each is computed only when the user can see that screen.
  const badges: Record<string, number> = {};
  const now = new Date();

  // Overdue follow-ups escalate on their own. There is no scheduler, so the
  // sweep runs whenever a signed-in page renders. Each lapse is claimed before
  // anyone is notified, so concurrent renders cannot notify twice, and a
  // failure here must never take the whole shell down with it.
  try {
    await escalateOverdueFollowUps(prisma, now);
  } catch (error) {
    console.error("Follow-up escalation sweep failed", error);
  }

  badges.notifications = await prisma.notification.count({
    where: { userId: ctx.id, readAt: null },
  });

  if (ctx.has(PERM.task.task.view)) {
    badges.tasks = await prisma.task.count({
      where: {
        status: { not: "DONE" },
        ...(ctx.has(PERM.task.task.viewAll)
          ? {}
          : { OR: [{ assignees: { some: { userId: ctx.id } } }, { createdById: ctx.id }] }),
      },
    });
  }

  // Onboarding forms waiting for a decision, for whoever may decide.
  if (ctx.has(PERM.hr.employee.acceptOnboarding)) {
    badges.onboarding = await prisma.employee.count({ where: { onboardingStatus: "SUBMITTED" } });
  }

  // Advance requests waiting for a decision, for whoever may approve.
  if (ctx.has(PERM.advance.advance.approve)) {
    badges.advances = await prisma.advance.count({ where: { status: "PENDING" } });
  }

  // Everything waiting on this person in the Approvals inbox.
  if (ctx.has(PERM.approvals.queue.view)) {
    badges.approvals = await inboxCount(prisma, ctx);
  }

  if (ctx.has(PERM.sales.followUp.view)) {
    badges.followUpDue = await prisma.lead.count({
      where: {
        nextActionAt: { lte: now },
        stage: { kind: { not: "LOST" } },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
    });
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
      }}
    >
      <AppShell badges={badges} checkIn={await loadCheckIn(prisma, ctx, now)}>{children}</AppShell>
    </PermissionProvider>
  );
}
