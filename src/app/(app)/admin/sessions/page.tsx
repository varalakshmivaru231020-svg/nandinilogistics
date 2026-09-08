import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { SessionsScreen } from "./sessions-screen";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const ctx = await requirePermission(PERM.admin.session.view);

  const sessions = await prisma.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Active Sessions"
        description="Signed-in devices. Revoking one takes effect on the very next request, without waiting for the token to expire."
      />

      <SessionsScreen
        sessions={sessions.map((s) => ({
          id: s.id,
          userName: s.user.name,
          userEmail: s.user.email,
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        }))}
        canRevoke={ctx.has(PERM.admin.session.revoke)}
      />
    </div>
  );
}
