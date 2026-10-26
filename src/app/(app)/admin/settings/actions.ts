"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { getSetting, setSetting } from "@/lib/settings";

export async function updateEscalationHoursAction(hours: number): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.admin.settings.update);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) {
      throw new Error("The grace period must be a whole number of hours, from 1 to 720.");
    }

    const before = await getSetting(prisma, "sales.followUpEscalation");
    await setSetting(prisma, "sales.followUpEscalation", { afterHours: hours }, ctx.id);
    await recordAudit({
      action: "UPDATE", entity: "AppSetting", entityId: "sales.followUpEscalation", userId: ctx.id,
      summary: `Follow-up escalation grace period changed from ${before.afterHours}h to ${hours}h`,
      changes: { afterHours: { from: before.afterHours, to: hours } },
    });

    revalidatePath("/admin/settings");
    return null;
  });
}
