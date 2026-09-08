import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PermissionProvider } from "@/components/rbac/permission-provider";
import { AppShell } from "@/components/shell/app-shell";
import { projectScopeFilter } from "@/lib/rbac/context";

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
      <AppShell badges={badges}>{children}</AppShell>
    </PermissionProvider>
  );
}
