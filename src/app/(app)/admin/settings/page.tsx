import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { getSetting } from "@/lib/settings";
import { SettingsScreen } from "./settings-screen";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePermission(PERM.admin.settings.view);

  const escalation = await getSetting(prisma, "sales.followUpEscalation");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="How the platform behaves for the whole organisation. Every change is recorded on the audit trail."
      />
      <SettingsScreen
        escalationHours={escalation.afterHours}
        canUpdate={ctx.has(PERM.admin.settings.update)}
      />
    </div>
  );
}
