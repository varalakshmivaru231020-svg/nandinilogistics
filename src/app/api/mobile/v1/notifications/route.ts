import { prisma } from "@/lib/db";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * What needs this person — their own notifications.
 *
 *   GET /api/mobile/v1/notifications
 *
 * Notifications have no export route, so the list endpoints could not carry
 * them and the app had no way to read them at all: the web screen existed,
 * the two mark-read actions were dispatchable, and nothing on the phone could
 * reach either. Only your own rows, as on the web — `requireAuth` and nothing
 * more, because a notification is addressed to one person.
 *
 * Each row carries the route the web would open, so `recordFor()` turns it
 * into the record it points at and the notification becomes a way in.
 */
export const GET = mobileRoute([], async (_req, actor) => {
  const rows = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return apiOk({
    title: "Notifications",
    description: "What needs you — escalations and anything addressed to you. Only you see these.",
    unread: rows.filter((n) => n.readAt === null).length,
    total: rows.length,
    rows: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
    serverTime: new Date().toISOString(),
  });
});
