import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { NotificationsScreen } from "./notifications-screen";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireAuth();

  const rows = await prisma.notification.findMany({
    where: { userId: ctx.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="What needs you — escalations and anything addressed to you. Only you see these."
      />
      <NotificationsScreen
        rows={rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          href: n.href,
          read: n.readAt !== null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
