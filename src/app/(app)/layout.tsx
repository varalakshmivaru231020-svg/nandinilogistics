import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PermissionProvider } from "@/components/rbac/permission-provider";
import { AppShell } from "@/components/shell/app-shell";
import { escalateOverdueFollowUps } from "@/lib/sales/lead-service";

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
      <AppShell badges={badges}>{children}</AppShell>
    </PermissionProvider>
  );
}
