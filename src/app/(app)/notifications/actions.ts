"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { runAction, type ActionResult } from "@/lib/rbac/guard";
import { getAuthContext } from "@/lib/rbac/context";

/**
 * A person's own notifications. There is no permission to hold here, the same
 * as a person's own account page: every read and write below is scoped to the
 * signed-in user, so there is nobody else's inbox to reach.
 */
async function signedIn() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Your session has ended. Sign in again.");
  return ctx;
}

export async function markNotificationReadAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await signedIn();
    const { count } = await prisma.notification.updateMany({
      where: { id, userId: ctx.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      // Already read is fine; not yours, or not there, is not.
      const mine = await prisma.notification.findFirst({ where: { id, userId: ctx.id }, select: { id: true } });
      if (!mine) throw new Error("Notification not found.");
    }
    revalidatePath("/notifications");
    return null;
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ marked: number }>> {
  return runAction(async () => {
    const ctx = await signedIn();
    const { count } = await prisma.notification.updateMany({
      where: { userId: ctx.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { marked: count };
  });
}
